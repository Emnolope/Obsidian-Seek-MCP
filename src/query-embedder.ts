import { prepareVector, requestedDevice, SEEK_MODEL, type SeekDevice } from './seek-compatibility.ts';

// Compatibility boundary: vendor/seek/src/model-registry.ts is retained
// byte-for-byte, but its Obsidian TypeScript imports are not NodeNext-resolvable.
// Keep this runtime spec mechanically aligned with Seek's ACTIVE_MODEL_SPEC.
const ACTIVE_MODEL_SPEC = {
  repo: SEEK_MODEL.repo,
  revision: SEEK_MODEL.revision,
  dim: SEEK_MODEL.dimension,
  dtype: SEEK_MODEL.dtype,
};

export const QUERY_EMBEDDING_DIM = ACTIVE_MODEL_SPEC.dim;

type FeatureExtractor = (text: string, options: Record<string, unknown>) => Promise<any>;

type SeekWebRuntime = {
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<FeatureExtractor>;
  env: {
    useWasmCache?: boolean;
    backends: {
      onnx?: {
        wasm?: {
          proxy?: boolean;
          wasmPaths?: { mjs?: string; wasm?: string };
        };
      };
    };
  };
};

export function configureNodeRuntimeForNode(runtime: SeekWebRuntime): SeekWebRuntime {
  const wasmPaths = runtime.env.backends.onnx?.wasm?.wasmPaths;
  if (wasmPaths) {
    const wasmBase = new URL('../node_modules/onnxruntime-web/dist/', import.meta.url);
    const plainMjs = new URL('ort-wasm-simd-threaded.mjs', wasmBase).href;
    const plainWasm = new URL('ort-wasm-simd-threaded.wasm', wasmBase).href;
    wasmPaths.mjs = plainMjs;
    wasmPaths.wasm = plainWasm;
  }
  runtime.env.useWasmCache = false;
  if (runtime.env.backends.onnx?.wasm) {
    runtime.env.backends.onnx.wasm.proxy = false;
  }
  return runtime;
}

let runtimePromise: Promise<SeekWebRuntime> | null = null;

// ── SEEK SOURCE PORT: iframe-runner.ts / overrideGlueForWasm ──────────────
// Seek's Android path uses the plain ORT-WASM glue. Transformers.js selects the
// asyncify glue on non-WebKit environments, but that build does not carry the
// CPU GatherBlockQuantized kernel required by this q4 model. Keep this copied
// shape and replacement logic aligned with Seek's function.
function overrideGlueForWasm(env: SeekWebRuntime['env']): string | null {
  const wasmPaths = env.backends.onnx?.wasm?.wasmPaths;
  if (!wasmPaths?.mjs) return null;
  if (!String(wasmPaths.mjs).includes('ort-wasm-simd-threaded.asyncify.mjs')) return null;
  wasmPaths.mjs = String(wasmPaths.mjs).replace('ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.mjs');
  if (wasmPaths.wasm) {
    wasmPaths.wasm = String(wasmPaths.wasm).replace('ort-wasm-simd-threaded.asyncify.wasm', 'ort-wasm-simd-threaded.wasm');
  }
  return 'plain';
}

// ── MCP ADAPTER CODE: Node process boundary ───────────────────────────────
// The plugin imports this web runtime inside an iframe. Node's package export
// would choose transformers.node.mjs and onnxruntime-node instead, so import
// the copied web build while hiding process during module evaluation. That
// makes its unchanged backend selection choose onnxruntime-web/WASM, matching
// the plugin's Android path. Restore process immediately after import; the
// imported module retains the selected backend.
async function loadRuntime(): Promise<SeekWebRuntime> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const nodeProcess = globalThis.process;
      (globalThis as { process?: typeof process }).process = undefined;
      try {
        const runtime = await import('../vendor/seek/runtime/transformers.web.js');
        overrideGlueForWasm(runtime.env);
        return configureNodeRuntimeForNode(runtime as unknown as SeekWebRuntime);
      } finally {
        (globalThis as { process?: typeof process }).process = nodeProcess;
      }
    })();
  }
  return runtimePromise;
}

export class SeekQueryEmbedder {
  private pipelinePromise: Promise<FeatureExtractor> | null = null;

  private load(): Promise<FeatureExtractor> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.loadWithBackend(requestedDevice());
    }
    return this.pipelinePromise;
  }

  private async loadWithBackend(requested: SeekDevice): Promise<FeatureExtractor> {
    const runtime = await loadRuntime();
    const options = {
      dtype: ACTIVE_MODEL_SPEC.dtype,
      ...(ACTIVE_MODEL_SPEC.revision ? { revision: ACTIVE_MODEL_SPEC.revision } : {}),
    };
    if (requested === 'wasm') {
      return runtime.pipeline('feature-extraction', ACTIVE_MODEL_SPEC.repo, { ...options, device: 'wasm' });
    }
    try {
      return await runtime.pipeline('feature-extraction', ACTIVE_MODEL_SPEC.repo, { ...options, device: 'webgpu' });
    } catch (error) {
      if (requested === 'webgpu') {
        throw new Error(`WebGPU embedding backend failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return runtime.pipeline('feature-extraction', ACTIVE_MODEL_SPEC.repo, { ...options, device: 'wasm' });
    }
  }

  async embed(text: string): Promise<Float32Array> {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('queryText must be a non-empty string');
    }
    const extractor = await this.load();
    const output = await extractor(text, {
      pooling: SEEK_MODEL.pooling,
      normalize: SEEK_MODEL.normalize,
      padding: true,
      truncation: true,
      max_length: SEEK_MODEL.maxLength,
    });
    const outputDim = output.dims[output.dims.length - 1];
    if (outputDim < QUERY_EMBEDDING_DIM) {
      throw new Error(`embed: model output dim ${outputDim} < ${QUERY_EMBEDDING_DIM}`);
    }
    const vector = prepareVector(output.data, QUERY_EMBEDDING_DIM);
    if (typeof output.dispose === 'function') output.dispose();
    return vector;
  }
}
