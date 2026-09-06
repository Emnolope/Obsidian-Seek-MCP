// Compatibility boundary: vendor/seek/src/model-registry.ts is retained
// byte-for-byte, but its Obsidian TypeScript imports are not NodeNext-resolvable.
// Keep this runtime spec mechanically aligned with Seek's ACTIVE_MODEL_SPEC.
const ACTIVE_MODEL_SPEC = {
  repo: 'tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX',
  revision: '54db88c5667bd79b4aea24ea6027a7ef45a7bbb5',
  dim: 384,
  dtype: 'q4' as const,
};

export const QUERY_EMBEDDING_DIM = ACTIVE_MODEL_SPEC.dim;

// Copied from Seek's iframe-runner.ts. The Node adapter keeps this output rule
// identical while replacing only Seek's browser iframe runtime.
function sliceAndRenormalize(vec: ArrayLike<number>, targetDim: number): Float32Array {
  if (vec.length <= targetDim) return Float32Array.from(vec);
  const sliced = new Float32Array(targetDim);
  for (let i = 0; i < targetDim; i++) sliced[i] = vec[i];
  let norm = 0;
  for (let i = 0; i < targetDim; i++) norm += sliced[i] * sliced[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < targetDim; i++) sliced[i] /= norm;
  return sliced;
}

type FeatureExtractor = (text: string, options: Record<string, unknown>) => Promise<any>;

type SeekWebRuntime = {
  pipeline: (task: string, model: string, options: Record<string, unknown>) => Promise<FeatureExtractor>;
  env: {
    backends: {
      onnx?: {
        wasm?: {
          wasmPaths?: { mjs?: string; wasm?: string };
        };
      };
    };
  };
};

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
        return runtime as unknown as SeekWebRuntime;
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
      this.pipelinePromise = loadRuntime().then(({ pipeline }) => pipeline(
        'feature-extraction',
        ACTIVE_MODEL_SPEC.repo,
        {
          // Copied from Seek's loadModel WASM fallback. Keep model, revision,
          // and q4 selection aligned with the vectors produced by the plugin.
          device: 'wasm',
          dtype: ACTIVE_MODEL_SPEC.dtype,
          ...(ACTIVE_MODEL_SPEC.revision ? { revision: ACTIVE_MODEL_SPEC.revision } : {}),
        },
      ));
    }
    return this.pipelinePromise;
  }

  async embed(text: string): Promise<Float32Array> {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('queryText must be a non-empty string');
    }
    const extractor = await this.load();
    const output = await extractor(text, {
      pooling: 'cls',
      normalize: true,
      padding: true,
      truncation: true,
      max_length: 128,
    });
    const outputDim = output.dims[output.dims.length - 1];
    if (outputDim < QUERY_EMBEDDING_DIM) {
      throw new Error(`embed: model output dim ${outputDim} < ${QUERY_EMBEDDING_DIM}`);
    }
    const vector = sliceAndRenormalize(output.data, QUERY_EMBEDDING_DIM);
    if (typeof output.dispose === 'function') output.dispose();
    if (!vector.every(Number.isFinite)) throw new Error('embed: model returned a non-finite vector');
    return vector;
  }
}
