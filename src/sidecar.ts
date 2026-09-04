// Seek-compatible 444-byte record codec.
//
// Derived from Obsidian Seek src/sidecar.ts.
// Upstream: https://github.com/ryan-manor/Obsidian-Seek
// Pinned source commit: 1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd
// Keep constants, record layout, and validation aligned with upstream.
// License: MIT. See NOTICE.md.

import { dequantizeInt8, type QuantVec } from './quant.ts';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const Q_BYTES = 384;
export const S_BYTES = 8;
export const SIGN_BYTES = (Q_BYTES + 7) >> 3;
export const CRC_BYTES = 4;
export const RECORD_PAYLOAD_BYTES = Q_BYTES + S_BYTES + SIGN_BYTES;
export const VEC_BYTES = RECORD_PAYLOAD_BYTES + CRC_BYTES;
export const DIM = Q_BYTES;
export const SIDECAR_FORMAT = 3;

export interface TierBytes {
    q: Int8Array;
    s: number;
    sign: Uint8Array;
}

export interface VectorRecord {
    id: string;
    dim: number;
    shard: string;
    seq: number;
    off: number;
    mtime: number;
    tombstone?: false;
}

export interface ResolvedEntry {
    id: string;
    shard: string;
    seq: number;
    off: number;
    mtime: number;
    dim: number;
}

function winsWithinDevice(challenger: VectorRecord, incumbent: VectorRecord): boolean {
    if (challenger.mtime !== incumbent.mtime) return challenger.mtime > incumbent.mtime;
    if ((challenger.seq ?? 0) !== (incumbent.seq ?? 0)) return challenger.seq > incumbent.seq;
    return challenger.off > incumbent.off;
}

function crossDeviceWins(challenger: VectorRecord, incumbent: VectorRecord): boolean {
    if (challenger.mtime !== incumbent.mtime) return challenger.mtime > incumbent.mtime;
    if (challenger.shard !== incumbent.shard) return challenger.shard > incumbent.shard;
    if (challenger.seq !== incumbent.seq) return challenger.seq > incumbent.seq;
    return challenger.off > incumbent.off;
}

// Derived from Seek src/sidecar.ts scanJsonl/readRecordAt at the pinned commit.
// Keep this small Node adapter structurally aligned with those functions.
export async function scanJsonl(indexDir: string): Promise<Map<string, ResolvedEntry>> {
    const names = (await readdir(indexDir)).filter(name => /^index\.[A-Za-z0-9-]+\.jsonl$/.test(name)).sort();
    const perId = new Map<string, Map<string, VectorRecord>>();
    for (const name of names) {
        const raw = await readFile(join(indexDir, name), 'utf8');
        for (const line of raw.split('\n')) {
            if (!line.trim()) continue;
            const record = JSON.parse(line) as VectorRecord;
            let byDevice = perId.get(record.id);
            if (!byDevice) { byDevice = new Map(); perId.set(record.id, byDevice); }
            const previous = byDevice.get(record.shard);
            if (!previous || winsWithinDevice(record, previous)) byDevice.set(record.shard, record);
        }
    }
    const resolved = new Map<string, ResolvedEntry>();
    for (const [id, byDevice] of perId) {
        let winner: VectorRecord | undefined;
        for (const record of byDevice.values()) {
            if (!winner || crossDeviceWins(record, winner)) winner = record;
        }
        if (winner) resolved.set(id, { id, shard: winner.shard, seq: winner.seq, off: winner.off, mtime: winner.mtime, dim: winner.dim });
    }
    return resolved;
}

export async function readRecordAt(indexDir: string, entry: ResolvedEntry): Promise<TierBytes> {
    const buf = await readFile(join(indexDir, `embeddings.${entry.shard}.${entry.seq}.bin`));
    return decodeRecord(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), entry.off, entry.dim);
}

let CRC32_TABLE: Uint32Array | null = null;
function crc32(bytes: Uint8Array, start: number, end: number): number {
    let table = CRC32_TABLE;
    if (!table) {
        table = new Uint32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
            table[n] = c >>> 0;
        }
        CRC32_TABLE = table;
    }
    let crc = 0xFFFFFFFF;
    for (let i = start; i < end; i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function encodeRecord(t: TierBytes): Uint8Array {
    if (t.q.length !== Q_BYTES) throw new Error(`encodeRecord: q length ${t.q.length} != ${Q_BYTES}`);
    if (t.sign.length !== SIGN_BYTES) throw new Error(`encodeRecord: sign length ${t.sign.length} != ${SIGN_BYTES}`);
    const out = new Uint8Array(VEC_BYTES);
    out.set(new Uint8Array(t.q.buffer, t.q.byteOffset, Q_BYTES), 0);
    new DataView(out.buffer).setFloat64(Q_BYTES, t.s, true);
    out.set(t.sign, Q_BYTES + S_BYTES);
    new DataView(out.buffer).setUint32(RECORD_PAYLOAD_BYTES, crc32(out, 0, RECORD_PAYLOAD_BYTES), true);
    return out;
}

export function decodeRecord(buf: ArrayBuffer, off: number, expectedDim: number = DIM): TierBytes {
    if (expectedDim !== DIM) throw new Error(`decodeRecord: record dim ${expectedDim} != ${DIM}`);
    if (!isOffsetInRange(buf.byteLength, off)) throw new Error(`decodeRecord: invalid offset ${off}`);
    const bytes = new Uint8Array(buf);
    const stored = new DataView(buf).getUint32(off + RECORD_PAYLOAD_BYTES, true);
    const computed = crc32(bytes, off, off + RECORD_PAYLOAD_BYTES);
    if (stored !== computed) throw new Error(`decodeRecord: CRC mismatch at off ${off}`);
    return {
        q: new Int8Array(buf.slice(off, off + Q_BYTES)),
        s: new DataView(buf).getFloat64(off + Q_BYTES, true),
        sign: new Uint8Array(buf.slice(off + Q_BYTES + S_BYTES, off + RECORD_PAYLOAD_BYTES)),
    };
}

export function isOffsetInRange(binSize: number, off: number): boolean {
    return off >= 0 && off + VEC_BYTES <= binSize;
}

export function dequantizeRecord(tier: TierBytes): Float32Array {
    return dequantizeInt8(tier.q, tier.s);
}