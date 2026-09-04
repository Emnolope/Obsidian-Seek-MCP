// Derived from Obsidian Seek src/quant.ts.
// Upstream: https://github.com/ryan-manor/Obsidian-Seek
// Pinned source commit: 1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd
// The implementation below is kept aligned with the upstream module.
// License: MIT. See NOTICE.md.

// Int8 scalar quantization (SQ8) for the fp32 exact-rerank tier.
//
// Why: the `embeddings` store held one Float32Array(d) per chunk (1536 B at
// d=384) purely to feed the stage-2 cosine rerank. That fp32 precision is
// unnecessary — int8 storage is used for a 4× index shrink, and the vectors
// dequantize back to fp32 on read.

export interface QuantVec {
    q: Int8Array;  // d components, each round(vᵢ / s) clamped to [-127, 127]
    s: number;     // dequant scale: vᵢ ≈ qᵢ · s  (s = max|vᵢ| / 127)
}

// Quantize a (unit-L2) fp32 vector to int8 + a per-vector scale.
export function quantizeInt8(vec: Float32Array): QuantVec {
    const dim = vec.length;
    let maxAbs = 0;
    for (let i = 0; i < dim; i++) {
        const a = vec[i] < 0 ? -vec[i] : vec[i];
        if (a > maxAbs) maxAbs = a;
    }
    const q = new Int8Array(dim);
    // Degenerate: an all-zero vector — guard against div-by-zero / NaN poisoning.
    if (maxAbs === 0) return { q, s: 0 };
    const s = maxAbs / 127;
    const inv = 1 / s;
    for (let i = 0; i < dim; i++) {
        // Math.round keeps the quantization error symmetric around each value.
        q[i] = Math.round(vec[i] * inv);
    }
    return { q, s };
}

export function dequantizeInt8(q: Int8Array, s: number): Float32Array {
    const dim = q.length;
    const out = new Float32Array(dim);
    for (let i = 0; i < dim; i++) out[i] = q[i] * s;
    return out;
}