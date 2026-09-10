import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { buildChildScript } from '../vendor/seek/src/iframe-runner.ts';

type CdpResponse = { id: number; result?: any; error?: { message?: string } };

export function summarizeRuntimeValue(value: unknown): {
  resultType: string;
  resultConstructor: string | null;
  resultKeys: string[];
  vectorType: string;
  vectorConstructor: string | null;
  vectorLength: number | null;
  vectorKeys: string[];
  vectorSample: unknown;
  latencyMs: number | null;
  errorText: string | null;
  exceptionText: string | null;
} {
  const result = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  const vector = result && typeof result === 'object' ? (result as { vector?: unknown }).vector : undefined;
  let sample: unknown = null;
  try {
    sample = Array.isArray(vector) ? vector.slice(0, 8) : (vector && typeof vector === 'object' && 'length' in (vector as object) ? Array.from(vector as ArrayLike<unknown>).slice(0, 8) : null);
  } catch {
    sample = { error: 'vector sample extraction failed' };
  }

  return {
    resultType: typeof value,
    resultConstructor: value && typeof value === 'object' && value !== null ? (value as { constructor?: { name?: string } }).constructor?.name ?? null : null,
    resultKeys: result ? Object.keys(result) : [],
    vectorType: typeof vector,
    vectorConstructor: vector && typeof vector === 'object' ? (vector as { constructor?: { name?: string } }).constructor?.name ?? null : null,
    vectorLength: Array.isArray(vector) ? vector.length : (vector && typeof vector === 'object' && 'length' in (vector as object) ? Number((vector as { length?: number }).length ?? null) : null),
    vectorKeys: vector && typeof vector === 'object' ? Object.keys(vector).slice(0, 12) : [],
    vectorSample: sample,
    latencyMs: typeof result?.latencyMs === 'number' ? result.latencyMs : null,
    errorText: typeof result?.error === 'string' ? result.error : null,
    exceptionText: typeof result?.exceptionDetails === 'object' && result.exceptionDetails && 'text' in result.exceptionDetails ? String((result.exceptionDetails as { text?: unknown }).text ?? '') || null : null,
  };
}

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
window.__seekLoaded = false;
window.__seekPending = new Map();
window.__seekDebug = {
  ready: () => window.__seekReady,
  loaded: () => window.__seekLoaded,
  pendingIds: () => Array.from(window.__seekPending.keys()),
  globals: () => Object.keys(window).filter((key) => key.startsWith('__seek')),
};
window.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') {
    console.error('[seek-debug] non-object message received', data);
    return;
  }
  if (data.id === '__ready') {
    console.log('[seek-debug] __ready handshake received');
    window.__seekReady = true;
    return;
  }
  if (data.id === '__error') {
    console.error('[seek-debug] __error message received', data);
    return;
  }
  const pending = window.__seekPending.get(data.id);
  if (!pending) {
    console.warn('[seek-debug] unexpected message without pending RPC', data);
    return;
  }
  window.__seekPending.delete(data.id);
  if (data.ok) pending.resolve(data.result);
  else pending.reject(new Error(data.error || 'Seek browser RPC failed'));
});
window.__seekRpc = (type, payload) => new Promise((resolve, reject) => {
  const id = 'mcp-' + crypto.randomUUID();
  console.log('[seek-debug] rpc request', { id, type, payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : null });
  window.__seekPending.set(id, { resolve, reject });
  window.postMessage({ id, type, payload }, '*');
});
window.__seekEmbed = async (text) => {
  try {
    console.log('[seek-debug] __seekEmbed invoked', { text, ready: window.__seekReady, loaded: window.__seekLoaded, pending: Array.from(window.__seekPending.keys()) });
    if (!window.__seekReady) {
      throw new Error('Seek browser runtime not ready: __seekReady is false');
    }
    if (!window.__seekLoaded) {
      console.log('[seek-debug] loading model inside browser');
      const loadResult = await window.__seekRpc('load', {
        modelId: 'tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX',
        device: 'webgpu',
        dtype: 'q4',
        skipWarmup: false,
        revision: '54db88c5667bd79b4aea24ea6027a7ef45a7bbb5',
      });
      console.log('[seek-debug] load result', loadResult);
      if (loadResult && loadResult.error) {
        throw new Error('Browser load failed: ' + String(loadResult.error));
      }
      window.__seekLoaded = true;
    }
    const result = await window.__seekRpc('embed', { text });
    console.log('[seek-debug] embed result', {
      resultType: typeof result,
      constructor: result && typeof result === 'object' ? result.constructor?.name ?? null : null,
      keys: result && typeof result === 'object' ? Object.keys(result) : [],
      hasVector: !!(result && typeof result === 'object' && 'vector' in result),
      vectorType: result && typeof result === 'object' && 'vector' in result ? typeof result.vector : null,
      vectorLen: result && typeof result === 'object' && 'vector' in result && result.vector && typeof result.vector === 'object' ? result.vector.length : null,
    });
    if (!result || typeof result !== 'object' || !('vector' in result)) {
      const state = {
        ready: window.__seekReady,
        loaded: window.__seekLoaded,
        globals: Object.keys(window).filter((key) => key.startsWith('__seek')),
        pending: Array.from(window.__seekPending.keys()),
        result,
      };
      throw new Error('Browser embed returned invalid object: ' + JSON.stringify(state));
    }
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error('[seek-debug] __seekEmbed threw', { text, ready: window.__seekReady, loaded: window.__seekLoaded, detail });
    throw error;
  }
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
    const result = await this.cdp.command<{ result?: { type?: string; subtype?: string; value?: T; description?: string; objectId?: string }; exceptionDetails?: { text?: string } }>('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    }, this.sessionId);

    if (result.exceptionDetails) {
      const text = result.exceptionDetails.text ?? 'Unknown Chromium exception';
      throw new Error(`Chromium evaluation threw: ${text}\nExpression: ${expression}`);
    }
    if (!result.result) {
      throw new Error(`Chromium evaluation returned no result for expression: ${expression}`);
    }
    if (result.result.value === undefined && result.result.type !== 'object') {
      throw new Error(`Chromium evaluation returned no value for expression: ${expression}. Details: ${result.result.description ?? 'no description'}`);
    }
    if (result.result.value === undefined && result.result.type === 'object') {
      throw new Error(`Chromium evaluation returned an object without a primitive value for expression: ${expression}. Details: ${result.result.description ?? 'no description'}; objectId=${result.result.objectId ?? 'n/a'}`);
    }
    return result.result.value as T;
  }

  async embed(text: string): Promise<Float32Array> {
    if (!this.browser) {
      try { await this.start(); }
      catch (error) { await this.close(); throw error; }
    }
    const probe = await this.evaluate<string>(`(() => {
      try {
        const fn = window.__seekEmbed;
        const state = {
          ready: !!window.__seekReady,
          loaded: !!window.__seekLoaded,
          hasSeekEmbed: typeof fn,
          seekEmbedString: typeof fn === 'function' ? fn.toString().slice(0, 200) : null,
          keys: Object.keys(window).filter((key) => key.startsWith('__seek')),
        };
        if (typeof fn !== 'function') {
          return JSON.stringify({ ok: false, error: 'window.__seekEmbed is not a function', state });
        }
        return Promise.resolve(fn(${JSON.stringify(text)})).then((value) => {
          const vector = value && typeof value === 'object' ? value.vector : undefined;
          const raw = Array.isArray(vector) ? vector : (vector && typeof vector === 'object' && typeof vector.length === 'number' ? Array.from(vector) : null);
          return JSON.stringify({ ok: Array.isArray(raw) && raw.length === 384 && raw.every((v) => typeof v === 'number' && Number.isFinite(v)), vector: raw, state });
        }).catch((error) => JSON.stringify({ ok: false, error: String(error), stack: error && error.stack ? error.stack : null, state }));
      } catch (error) {
        return JSON.stringify({ ok: false, error: String(error), stack: error && error.stack ? error.stack : null, state: { ready: !!window.__seekReady, loaded: !!window.__seekLoaded, globals: Object.keys(window).filter((key) => key.startsWith('__seek')) } });
      }
    })()`);

    let parsed: any;
    try { parsed = JSON.parse(probe); } catch { throw new Error(`Chromium returned non-JSON embed probe: ${String(probe)}`); }
    if (!parsed || parsed.ok !== true || !Array.isArray(parsed.vector) || parsed.vector.length !== 384 || !parsed.vector.every((value: unknown) => typeof value === 'number' && Number.isFinite(value))) {
      const detail = parsed && parsed.state ? JSON.stringify(parsed.state) : String(probe);
      throw new Error(`Chromium sidecar returned an invalid 384-value vector; browser state: ${detail}`);
    }
    return Float32Array.from(parsed.vector);
  }

  async inspectEmbed(text: string): Promise<unknown> {
    if (!this.browser) {
      try { await this.start(); }
      catch (error) { await this.close(); throw error; }
    }
    return this.evaluate<string>(`(() => {
      const fn = window.__seekEmbed;
      const state = {
        ready: !!window.__seekReady,
        loaded: !!window.__seekLoaded,
        hasSeekEmbed: typeof fn,
        seekEmbedKeys: Object.keys(window).filter((key) => key.startsWith('__seek')),
        pending: window.__seekPending ? Array.from(window.__seekPending.keys()) : [],
        fnSource: typeof fn === 'function' ? fn.toString().slice(0, 250) : null,
      };
      if (typeof fn !== 'function') {
        return JSON.stringify({ ok: false, error: 'window.__seekEmbed is not a function', state });
      }
      return Promise.resolve(fn(${JSON.stringify(text)})).then((value) => {
        const result = value && typeof value === 'object' ? value : { raw: value };
        const vector = result && typeof result === 'object' ? result.vector : undefined;
        let sample = null;
        try { sample = Array.isArray(vector) ? vector.slice(0, 8) : (vector && typeof vector === 'object' && 'length' in vector ? Array.from(vector).slice(0, 8) : null); } catch (error) { sample = { error: String(error) }; }
        return JSON.stringify({
          ok: true,
          state,
          resultType: typeof value,
          resultConstructor: value && typeof value === 'object' ? value.constructor?.name ?? null : null,
          resultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
          vectorType: typeof vector,
          vectorConstructor: vector && typeof vector === 'object' ? vector.constructor?.name ?? null : null,
          vectorLength: vector && typeof vector === 'object' && 'length' in vector ? vector.length : null,
          vectorKeys: vector && typeof vector === 'object' ? Object.keys(vector).slice(0, 12) : [],
          vectorSample: sample,
          latencyMs: result && typeof result === 'object' ? result.latencyMs ?? null : null,
          errorText: result && typeof result === 'object' && typeof result.error === 'string' ? result.error : null,
        });
      }).catch((error) => JSON.stringify({ ok: false, error: String(error), stack: error && error.stack ? error.stack : null, state }));
    })()`);
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