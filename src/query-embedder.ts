import { pipeline } from '@huggingface/transformers';

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

export class SeekQueryEmbedder {
  private pipelinePromise: Promise<FeatureExtractor> | null = null;

  private load(): Promise<FeatureExtractor> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = pipeline('feature-extraction', ACTIVE_MODEL_SPEC.repo, {
        // Seek uses WASM inside its browser iframe. Transformers.js Node uses
        // the equivalent CPU execution provider; all model and postprocessing
        // settings remain aligned with Seek.
        device: 'cpu',
        dtype: ACTIVE_MODEL_SPEC.dtype,
        ...(ACTIVE_MODEL_SPEC.revision ? { revision: ACTIVE_MODEL_SPEC.revision } : {}),
      }) as Promise<FeatureExtractor>;
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
