# Seek Index Format Investigation

Investigation date: 2026-09-03

Reference repositories were treated as read-only. Only this report was written in
`Obsidian-Seek-MCP`.

## Executive Finding

The full generated index is `/workspaces/system-vault/Seek Index/`, not the
small index currently under
`/workspaces/system-vault/.obsidian/plugins/seek/index/`.

`Seek Index/` contains 6,736 vector records. Its 2,990,784-byte binary shard is
exactly `6,736 * 444`, so the shard is a concatenation of fixed 444-byte records,
with no global header. The source defines each record as:

```text
[q:384 signed-int8 bytes]
[s:8-byte little-endian float64]
[sign:48 packed sign-bit bytes]
[crc:4-byte little-endian CRC-32]
```

This is a custom binary sidecar format, not JSON, SQLite, or a general-purpose
vector-database file. JSON and JSONL sidecars provide metadata and record
locations.

## Files And Sizes

### Full generated index: `system-vault/Seek Index/`

| File | `file` result | Size |
|---|---|---:|
| `meta.mobile-a72520e0.json` | JSON text data | 330 bytes |
| `index.mobile-a72520e0.jsonl` | New Line Delimited JSON text data | 698,037 bytes |
| `embeddings.mobile-a72520e0.0.bin` | data | 2,990,784 bytes |
| Directory total | | 3.6 MB |

The JSONL file has 6,736 lines. The first records are JSON objects such as:

```json
{"id":"0190363da319fc","dim":384,"shard":"mobile-a72520e0","seq":0,"off":0,"mtime":1788404404143}
{"id":"075814f6034206","dim":384,"shard":"mobile-a72520e0","seq":0,"off":444,"mtime":1788404404143}
```

The metadata identifies model, revision, `chunkerVersion: 10`, `dim: 384`,
`format: 3`, and device `mobile-a72520e0`.

### Plugin-local copy: `system-vault/.obsidian/plugins/seek/index/`

| File | `file` result | Size |
|---|---|---:|
| `meta.mobile-a72520e0.json` | JSON text data | 308 bytes |
| `index.mobile-a72520e0.jsonl` | JSON text data | 98 bytes |
| `embeddings.mobile-a72520e0.0.bin` | data (the `file` utility reports a QDOS signature for this short binary) | 444 bytes |
| Directory total | | 868 KB for the whole plugin directory, including `main.js`, CSS, and logs |

The plugin-local JSONL has one record and the binary has one 444-byte record.
Its metadata has the same model, revision, dimension, and format, but
`lastFullReindex` is `null`. The two copies have different SHA-256 hashes.
The full `Seek Index/` copy is therefore the relevant generated dataset; the
plugin-local copy is a separate one-record artifact or initialization state.

## Raw Byte Inspection

The first 200 bytes were inspected with both `file` and `od`/escaped text output.
The important observations are:

| File class | First bytes as hex | Text interpretation |
|---|---|---|
| Full binary shard | `fa 01 05 01 0d fd 02 fa 0c 07 08 ff 04 06 00 01 ...` | Non-printable signed-byte data, not text |
| Plugin binary shard | `fb 01 06 01 04 06 01 fc fe fd 04 fa 00 0f 0d ...` | Non-printable signed-byte data, not text |
| Full JSONL | `7b 22 69 64 22 3a 22 30 31 39 30 ...` | Starts with `{"id":"019...` |
| Plugin JSONL | `7b 22 69 64 22 3a 22 31 37 35 31 ...` | Starts with `{"id":"175...` |
| Both metadata files | `7b 0a 20 20 22 6d 6f 64 65 6c 49 64 ...` | Starts with formatted JSON: `{` then newline and `"modelId"` |

The binary begins immediately with vector-like int8 values. There is no magic
number, version header, dimension field, or record count in the shard itself.
The dimension and format version are in the metadata/JSONL sidecars.

## Confirmed From Source

### Record layout

`/workspaces/Obsidian-Seek/src/sidecar.ts:35-49` describes the sidecar as the
persisted DB v6 tiers and defines the sizes:

- `Q_BYTES = ACTIVE_MODEL_SPEC.dim`, which is 384 for this index.
- `S_BYTES = 8` for the dequantization scale.
- `SIGN_BYTES = ceil(384 / 8) = 48`.
- `RECORD_PAYLOAD_BYTES = 384 + 8 + 48 = 440`.
- `VEC_BYTES = 440 + 4 = 444`.
- `CRC_BYTES = 4`, for CRC-32 over the first 440 bytes.

`/workspaces/Obsidian-Seek/src/sidecar.ts:152-174` implements the codec. It
writes the quantized vector bytes first, calls
`DataView.setFloat64(Q_BYTES, t.s, true)` for a little-endian float64 scale,
copies packed sign bits, and writes a little-endian CRC-32 with
`setUint32(RECORD_PAYLOAD_BYTES, ..., true)`.

The same source describes the packed layout explicitly as:

```text
[q:384 | s:f64LE:8 | sign:48 | crc:u32LE:4]
```

### Quantization

`/workspaces/Obsidian-Seek/src/quant.ts:1-37` identifies this as int8 scalar
quantization, or SQ8. `quantizeInt8` receives a `Float32Array`, computes a
per-vector scale `s = max(abs(v)) / 127`, and stores each component as
`Math.round(v / s)` in an `Int8Array`.

`/workspaces/Obsidian-Seek/src/quant.ts:44-68` confirms that the stored `q` is
384 signed int8 components and that dequantization returns `q[i] * s` as
`Float32Array` values. The query remains float32; stored vectors are
dequantized for the cosine rerank. There is no product quantization, binary-only
vector representation, or global scale. The sign-bit tier is an additional
candidate-generation representation.

### How files are written

`/workspaces/Obsidian-Seek/src/sidecar.ts:521-559` writes binary artifacts with
`adapter.writeBinary` to a temporary file followed by rename. Text artifacts use
the same temporary-file and atomic-rename pattern through `adapter.write`.

`/workspaces/Obsidian-Seek/src/sidecar.ts:639-662` appends JSONL records with
`adapter.append`, falling back to read-plus-atomic-rewrite when append fails.

`/workspaces/Obsidian-Seek/src/sidecar.ts:707-757` shows the append protocol:
each flush creates fresh shard files, places records consecutively at offsets
`0`, `444`, `888`, and so on, writes the binary shard first, then appends JSONL
locator lines referring to it. Large batches split at the 4 MiB shard cap.

### Mapping from vector to chunk and note

`/workspaces/Obsidian-Seek/src/sidecar.ts:75-93` defines each JSONL vector
record with `id`, `dim`, `shard`, `seq`, `off`, and `mtime`. The `id` is a
`chunk_id`; `seq` selects the shard and `off` selects the 444-byte record within
that shard. The binary record itself contains no chunk ID or note path.

`/workspaces/Obsidian-Seek/src/index-store.ts:1-17` documents the normal local
IndexedDB schema: chunk metadata, chunk bodies, quantized embeddings, packed
binary vectors, file records, and configuration are separate object stores.

`/workspaces/Obsidian-Seek/src/index-store.ts:668-713` confirms that a normal
batch writes `chunk_meta`, `chunk_body`, `embeddings`, and `binary` using the
same `chunk_id` key, and that a file record maps `note_path` to `chunk_ids`.
The source therefore establishes this mapping chain:

```text
JSONL id -> chunk_id
chunk_id -> chunk metadata/body in IndexedDB
note_path -> chunk_ids in the IndexedDB files store
```

The sidecar JSONL is a locator, not a self-contained note/chunk database. The
full generated `Seek Index/` folder contains no visible note-path or chunk-body
store alongside its three files.

`/workspaces/Obsidian-Seek/src/chunker.ts:42-76` confirms that `chunk_id` is a
path-salted cyrb53 hash of note path, title, content, and (when present) the
dense frontmatter suffix. This makes the ID reproducible only when the original
note path/content/chunking logic is available; it is not a reversible encoding
of the path.

## Still Unclear

- The three exported files do not contain the IndexedDB `chunk_meta`,
  `chunk_body`, or `files` stores, so the real note-path-to-chunk mapping cannot
  be recovered from `Seek Index/` alone.
- The current sample has one shard, so multi-shard behavior is source-confirmed
  but not observed in this vault directory. The source says shard sequence is
  selected by JSONL `seq` and capped at 4 MiB.
- The CRC bytes were not independently decoded and checked against every
  record. The source defines CRC-32 IEEE behavior, but an implementation should
  still validate this against sample records before trusting arbitrary files.
- The exact relationship between the committed `Seek Index/` export and the
  current IndexedDB instance is not directly observable from these files. The
  metadata and record format show compatibility, but the sidecar does not prove
  that every record still has a corresponding live note.
- The source comments describe the binary sign-bit tier as derived from the
  true fp32 vector, but the sidecar only stores its packed bytes; reconstructing
  the original fp32 vector is not possible from int8 plus scale alone.

## Next Checks Before Building The MCP Server

1. Parse every JSONL line and verify that IDs are unique, `dim` is 384, offsets
   are non-negative multiples of 444, and every `seq/off` points inside an
   existing shard.
2. Decode every 444-byte record using the source layout and verify every CRC-32.
3. Decode the float64 scale and int8 values, then compare a few reconstructed
   vectors against Seek's scoring implementation or a known query result.
4. Determine where the corresponding IndexedDB data is available. In
   particular, export or inspect the `chunk_meta`, `chunk_body`, and `files`
   stores if note paths and text retrieval are required by the MCP server.
5. Reproduce Seek's embedding model, preprocessing, normalization, candidate
   sign-bit scoring, and int8 cosine reranking before implementing query-time
   RAG. The stored index alone cannot generate a new query vector.

No parser or MCP server was implemented in this investigation.