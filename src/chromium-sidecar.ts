import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { buildChildScript } from '../vendor/seek/src/iframe-runner.ts';

type CdpResponse = { id: number; result?: any; error?: { message?: string } };

class CdpConnection {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  private socket: WebSocket;

  constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as CdpResponse;
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message ?? 'CDP command failed'));
      else request.resolve(message.result);
    });
    this.socket.addEventListener('close', () => {
      for (const request of this.pending.values()) request.reject(new Error('Chromium CDP connection closed'));
      this.pending.clear();
    });
  }

  async open(): Promise<void> {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      this.socket.addEventListener('open', () => resolve(), { once: true });
      this.socket.addEventListener('error', () => reject(new Error('Chromium CDP WebSocket failed to open')), { once: true });
    });
  }

  command<T>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close(): void { this.socket.close(); }
}

const BROWSER_HTML = (childScript: string) => `<!doctype html><meta charset="utf-8"><script>
window.__seekReady = false;
window.__seekPending = new Map();
window.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.id === '__ready') { window.__seekReady = true; return; }
  const pending = data && window.__seekPending.get(data.id);
  if (!pending) return;
  window.__seekPending.delete(data.id);
  if (data.ok) pending.resolve(data.result);
  else pending.reject(new Error(data.error || 'Seek browser RPC failed'));
});
window.__seekRpc = (type, payload) => new Promise((resolve, reject) => {
  const id = 'mcp-' + crypto.randomUUID();
  window.__seekPending.set(id, { resolve, reject });
  window.postMessage({ id, type, payload }, '*');
});
window.__seekEmbed = async (text) => {
  if (!window.__seekLoaded) {
    await window.__seekRpc('load', { modelId: 'tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX', device: 'webgpu', dtype: 'q4', skipWarmup: false, revision: '54db88c5667bd79b4aea24ea6027a7ef45a7bbb5' });
    window.__seekLoaded = true;
  }
  return window.__seekRpc('embed', { text });
};
</script><script type="module">${childScript}</script>`;

export interface ChromiumSidecarOptions {
  executablePath?: string;
  headless?: boolean;
}

export class ChromiumSidecar {
  private browser: ChildProcessWithoutNullStreams | null = null;
  private server: Server | null = null;
  private cdp: CdpConnection | null = null;
  private sessionId: string | null = null;

  async start(options: ChromiumSidecarOptions = {}): Promise<void> {
    if (this.browser) return;
    const html = BROWSER_HTML(buildChildScript(
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0',
      384,
    ));
    this.server = createServer((request, response) => {
      if (request.url !== '/seek.html') { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(html);
    });
    this.server.listen(0, '127.0.0.1');
    await once(this.server, 'listening');
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Chromium sidecar HTTP server failed to bind');
    const pageUrl = `http://127.0.0.1:${address.port}/seek.html`;

    const executable = options.executablePath ?? process.env.SEEK_CHROMIUM_PATH ?? 'chromium';
    this.browser = spawn(executable, [
      ...(options.headless === false ? [] : ['--headless=new']),
      '--enable-unsafe-webgpu', '--no-sandbox', '--disable-dev-shm-usage', '--remote-debugging-port=0',
      '--user-data-dir=/tmp/obsidian-seek-mcp-chromium', 'about:blank',
    ], { stdio: 'pipe' });
    const browserError = new Promise<never>((_, reject) => {
      this.browser!.once('error', (error) => reject(new Error(`Unable to start Chromium: ${error.message}`)));
      this.browser!.once('exit', (code, signal) => {
        if (!this.cdp) reject(new Error(`Chromium exited before CDP startup (code=${code}, signal=${signal})`));
      });
    });
    browserError.catch(() => {});
    let endpoint = '';
    this.browser.stderr.setEncoding('utf8');
    this.browser.stderr.on('data', (chunk: string) => {
      const match = chunk.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) endpoint = match[1];
    });
    const deadline = Date.now() + 15_000;
    while (!endpoint && Date.now() < deadline) {
      await Promise.race([new Promise((resolve) => setTimeout(resolve, 50)), browserError]);
    }
    if (!endpoint) throw new Error('Chromium did not expose a DevTools WebSocket; set SEEK_CHROMIUM_PATH to a Chromium build');
    this.cdp = new CdpConnection(endpoint);
    await this.cdp.open();
    const target = await this.cdp.command<{ targetId: string }>('Target.createTarget', { url: pageUrl });
    const attached = await this.cdp.command<{ sessionId: string }>('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    this.sessionId = attached.sessionId;
    await this.cdp.command('Runtime.enable', {}, this.sessionId);
    await this.cdp.command('Page.enable', {}, this.sessionId);
    await this.waitForReady();
  }

  private async waitForReady(): Promise<void> {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const state = await this.evaluate<{ ready: boolean }>('({ ready: window.__seekReady })');
      if (state.ready) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Seek Chromium child did not become ready');
  }

  private async evaluate<T>(expression: string): Promise<T> {
    if (!this.cdp || !this.sessionId) throw new Error('Chromium sidecar is not started');
    const result = await this.cdp.command<{ result: { value?: T; description?: string } }>('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    }, this.sessionId);
    if (result.result.value === undefined) throw new Error(result.result.description ?? 'Chromium evaluation returned no value');
    return result.result.value;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.browser) {
      try { await this.start(); }
      catch (error) { await this.close(); throw error; }
    }
    const encoded = await this.evaluate<unknown>(`window.__seekEmbed(${JSON.stringify(text)}).then(value => Array.from(value.vector))`);
    let values: unknown;
    if (typeof encoded === 'string') {
      try { values = JSON.parse(encoded); } catch { throw new Error('Chromium sidecar returned invalid vector JSON'); }
    } else {
      values = encoded;
    }
    if (!Array.isArray(values) || values.length !== 384 || !values.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      throw new Error(`Chromium sidecar returned an invalid 384-value vector (${typeof values})`);
    }
    return Float32Array.from(values);
  }

  async inspectEmbed(text: string): Promise<unknown> {
    if (!this.browser) {
      try { await this.start(); }
      catch (error) { await this.close(); throw error; }
    }
    return this.evaluate<string>(`window.__seekEmbed(${JSON.stringify(text)}).then(value => JSON.stringify((() => {
      const vector = value && value.vector;
      let sample = null;
      try { sample = Array.from(vector ?? []).slice(0, 8); } catch (error) { sample = { error: String(error) }; }
      return {
        resultType: typeof value,
        resultConstructor: value?.constructor?.name ?? null,
        resultKeys: value && typeof value === 'object' ? Object.keys(value) : [],
        vectorType: typeof vector,
        vectorConstructor: vector?.constructor?.name ?? null,
        vectorLength: vector?.length ?? null,
        vectorKeys: vector && typeof vector === 'object' ? Object.keys(vector).slice(0, 12) : [],
        vectorSample: sample,
        latencyMs: value?.latencyMs ?? null,
      };
    })()))`);
  }

  async close(): Promise<void> {
    this.cdp?.close();
    this.cdp = null;
    this.sessionId = null;
    this.browser?.kill();
    this.browser = null;
    if (this.server) await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }
}