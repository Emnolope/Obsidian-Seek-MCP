# Seek/MCP Technical Investigation

Last verified: 2026-09-04

This file records what exists and how it works. The rationale belongs in
`CONTEXT.md`; the ordered work list belongs in `todo.md`.

## Repository layout

The MCP repository is `/workspaces/Obsidian-Seek-MCP`.

The working Seek checkout used for compatibility work is
`/workspaces/Obsidian-Seek`. Its current source commit is:

```text
1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd
```

The two repositories are separate. The MCP repository was pushed to GitHub in
commit `cbd7d77` (`Add Seek-compatible MCP server`). The modified Seek checkout
was built and published as release `1.1.3-mcp-export-v2`; BRAT installation and
the explicit export command both completed successfully.

## Current data flow

```text
Seek IndexedDB
  -> modified Seek exporter
  -> Seek native sidecar files + MCP Export document mapping
  -> Git sync to the agent vault copy
  -> MCP server loads native sidecar records
  -> MCP joins chunk IDs to document records
  -> cosine ranking
  -> MCP results to PicoClaw
```

The MCP server is read-only. It does not write notes, run Git, reindex Seek, or
modify the source-of-truth vault.

## Seek source changes

The modified Seek checkout contains:

- `src/mcp-export.ts`
  - Reads `IndexStore.listAllMeta()`.
  - Reads bodies with `IndexStore.getBodiesMap()`.
  - Reads file mappings with `IndexStore.listFileRecords()`.
  - Reads quantized vectors with `IndexStore.listAllEmbeddings()`.
  - Joins all four sources by `chunk_id`.
  - Rejects any chunk missing metadata, body, vector, or note mapping.
  - Writes only the document mapping, not a second vector format.
- `src/main.ts`
  - Registers **Seek: Export complete MCP index**.
  - Reports success or failure with an Obsidian notice.

The exporter writes this structure below the vault root:

```text
Seek Index/
  meta.<deviceId>.json
  index.<deviceId>.jsonl
  embeddings.<deviceId>.<seq>.bin
  MCP Export/
    export.meta.json
    documents.jsonl
```

The exporter currently writes a temporary directory named like
`MCP Export.tmp-<generation>`, writes `documents.jsonl` and then
`export.meta.json`, removes the previous `MCP Export` directory, and renames the
temporary directory into place. The generation marker is in the MCP metadata,
but it is not currently written into Seek's native sidecar metadata, so exact
cross-file generation coupling remains unfinished.

## MCP document export contract

`MCP Export/export.meta.json` has this shape:

```json
{
  "schemaVersion": 1,
  "generation": "<timestamp>-<chunk-count>",
  "modelId": "tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX",
  "revision": "54db88c5667bd79b4aea24ea6027a7ef45a7bbb5",
  "chunkerVersion": 10,
  "dimension": 384,
  "chunkCount": 6736
}
```

Each `MCP Export/documents.jsonl` line contains:

```json
{
  "chunkId": "0190363da319fc",
  "notePath": "Projects/example.md",
  "title": "Example",
  "content": "The chunk text",
  "chunkIndex": 0,
  "mtime": 1788404404143
}
```

The document manifest intentionally does not contain `q`, `s`, or a float
vector. The vector is read from Seek's native binary shard using the `chunkId`
locator in the native JSONL sidecar.

## Native Seek sidecar format

The real sample was inspected under:

```text
/workspaces/system-vault/Seek Index/
```

Observed files and sizes:

| File | Size |
| --- | ---: |
| `meta.mobile-a72520e0.json` | 330 bytes |
| `index.mobile-a72520e0.jsonl` | 698,037 bytes |
| `embeddings.mobile-a72520e0.0.bin` | 2,990,784 bytes |

The sample has 6,736 JSONL records and 6,736 unique IDs. The binary shard size
is exactly `6,736 * 444 = 2,990,784` bytes.

### Sidecar metadata

The real metadata identifies:

```text
modelId: tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX
revision: 54db88c5667bd79b4aea24ea6027a7ef45a7bbb5
chunkerVersion: 10
dim: 384
format: 3
deviceId: mobile-a72520e0
```

The MCP loader accepts format `3` and requires the sidecar dimension to match
the MCP export dimension.

### JSONL locator

Each native locator line has this shape:

```json
{
  "id": "0190363da319fc",
  "dim": 384,
  "shard": "mobile-a72520e0",
  "seq": 0,
  "off": 0,
  "mtime": 1788404404143
}
```

Meaning:

- `id`: Seek `chunk_id`; it is not a reversible note path.
- `dim`: stored vector dimension.
- `shard`: device ID used in the binary filename.
- `seq`: shard sequence number.
- `off`: byte offset of the fixed-size record in that shard.
- `mtime`: record freshness used by winner resolution.

The MCP implementation scans files matching `index.<deviceId>.jsonl`, resolves
the newest record per device, then resolves the cross-device winner by mtime,
device ID, sequence, and offset. The current MCP reader does not yet support
tombstone records; it is intended for the live exported vector set.

### Binary record layout

The native record is exactly 444 bytes:

```text
[q:384 signed int8 bytes]
[s:8-byte little-endian float64]
[sign:48 packed sign-bit bytes]
[crc:4-byte little-endian CRC-32]
```

Constants in the compatibility module `src/sidecar.ts` are:

```text
Q_BYTES = 384
S_BYTES = 8
SIGN_BYTES = 48
RECORD_PAYLOAD_BYTES = 440
VEC_BYTES = 444
DIM = 384
SIDECAR_FORMAT = 3
```

CRC32 is IEEE CRC-32 over the first 440 bytes. `decodeRecord()` checks the CRC,
checks the expected dimension, validates the offset, and returns `TierBytes`:

```text
{ q: Int8Array(384), s: number, sign: Uint8Array(48) }
```

The usable stored vector is reconstructed as:

```text
vector[i] = q[i] * s
```

### Shards

Seek uses a 4 MiB shard cap. Records are written consecutively at offsets
`0`, `444`, `888`, and so on. The binary file has no global header, dimension,
record count, or magic number; those values come from metadata and locators.

## IndexedDB source schema

Seek's normal IndexedDB stores are documented in
`/workspaces/Obsidian-Seek/src/index-store.ts`:

```text
chunk_meta   chunk_id -> chunk metadata, excluding body text
chunk_body   chunk_id -> content string
embeddings   chunk_id -> QuantVec { q: Int8Array, s: number }
binary       chunk_id -> packed sign-bit Uint8Array
files        note_path -> { mtimeMs, chunk_ids, ... }
meta         singleton index configuration
bm25         serialized lexical-search cache
```

The required join inside Seek is:

```text
files.note_path
  -> files.chunk_ids
  -> chunk_meta + chunk_body
  -> embeddings / binary
```

`chunk_id` is a content/path-salted cyrb53 hash produced by the chunker. It
cannot be decoded into a note path. That is why the exporter must include the
document mapping.

Useful existing `IndexStore` methods are:

```text
getMeta()
listAllMeta()
getBodiesMap(ids)
listFileRecords()
listAllEmbeddings()
listAllBinary()
```

The exporter currently uses the first five relevant reads and does not need to
duplicate IndexedDB transaction code.

## MCP implementation

### Compatibility modules

- `src/quant.ts`: Seek-shaped `QuantVec`, quantization, and dequantization.
- `src/sidecar.ts`: Seek-shaped constants, CRC32, record codec, locator
  scanning, winner resolution, and shard reads.
- `UPSTREAM.md`: source-to-counterpart map and adaptation notes.
- `NOTICE.md`: upstream attribution and MIT licensing information.

These modules are not byte-for-byte copies. The codec and data rules are kept
aligned with Seek, while Node filesystem imports and adapters are necessarily
different. The MCP transport and tool logic are new.

### Loader behavior

`src/index.ts`:

1. Resolves the configured parent `Seek Index` directory.
2. Reads `MCP Export/export.meta.json`.
3. Finds a valid `meta.<deviceId>.json` sidecar metadata file.
4. Requires sidecar format `3` and matching dimension.
5. Scans native `index.<deviceId>.jsonl` files.
6. Resolves each document's `chunkId` to a native locator.
7. Reads the matching `embeddings.<shard>.<seq>.bin` record.
8. Validates offset, dimension, and CRC32.
9. Dequantizes the native `q`/`s` record.
10. Loads the document content and note mapping.

The loader currently keeps all decoded documents/vectors in memory and performs
a full linear scan for each semantic search.

### MCP tools

`src/server.ts` exposes these read-only tools over stdio:

```text
index_status
semantic_search
fetch_chunk
fetch_note
```

`semantic_search` currently accepts:

```text
queryVector: number[]       required, exactly 384 values
topK: integer                optional, 1..100, default 10
pathPrefix: string           optional
```

It returns chunk-level records ranked by cosine similarity. It does not yet
accept ordinary query text, group multiple chunks by note, or use the sign-bit
candidate-generation stage.

The server starts with:

```sh
npm ci
SEEK_EXPORT_DIR="/path/to/Seek Index" npm start
```

`SEEK_EXPORT_DIR` must point to the parent directory containing both the native
Seek sidecar files and `MCP Export/`, not to `MCP Export/` itself.

## Query embedding and stale-export investigation

The query path was added after tracing Seek's Granite model identifier and
query-side preprocessing from the vendored source rather than relying on the
minified plugin bundle. `src/query-embedder.ts` keeps the pinned model,
revision, CLS pooling, normalization, 128-token limit, and 384-dimensional
output. It replaces Seek's browser iframe/WASM execution with the Node CPU
provider; this is a runtime adaptation, not a change to the embedding space.

The MCP loader was then changed to tolerate a stale document mapping without a
matching native locator. It keeps usable vector/document pairs, reports
`exportedDocuments`, `loadedDocuments`, `skippedDocuments`, and
`orphanVectors` through `index_status`, and continues to reject malformed
records, invalid paths, dimension mismatches, and CRC failures. The plugin
exporter remains responsible for producing a complete atomic export; this
read-side tolerance is a recovery behavior, not proof that the export is
consistent.

The supplied `system-vault` confirms the case that motivated this policy:
6,735 document records and 6,736 native locator records. Full binary and live
query validation remain separate checks.

## Immediate plugin work

The next implementation task is in `/workspaces/Obsidian-Seek`: connect the
export command to the successful indexing lifecycle so MCP document mappings,
native locators, and vectors are published as one generation. The integration
must be intentionally diff-friendly. Add a clearly named export helper, mark
the indexing call site with an explicit MCP/export boundary, and leave concise
rationale comments around the atomic commit marker. Preserve Seek's existing
embedding and quantization functions instead of folding MCP behavior into
generic vector calculations. A reviewer should be able to identify every
plugin-side addition or modification from a normal source diff.

## Current validation

The MCP project has:

```sh
npm run build
node --experimental-strip-types --test test/*.test.ts
```

The committed tests currently cover:

- loading a CRC-protected native-style binary fixture
- 384-dimensional cosine ranking
- path traversal rejection for note fetches

Most recent successful result:

```text
MCP build: passed
MCP tests: 2 passed, 0 failed
Seek typecheck: passed
```

The modified Seek repository's broader suite previously passed with:

```text
65 test files passed
1167 tests passed
1 skipped
```

The original real sidecar inspection independently reported:

```text
records: 6736
uniqueIds: 6736
invalidRecords: 0
crcFailures: 0
```

The MCP loader now performs the real document join and reports 6,729 usable
pairs, 6 skipped mappings, and 7 orphan native locators. The join is therefore
known to be incomplete; fixing the plugin export lifecycle is the next task.

## Known technical gaps

- The real export loads through the MCP loader, but its document join is
  incomplete: 6,729 pairs are searchable, 6 mappings are skipped, and 7 native
  locators are orphaned.
- The manifest generation ID is not coupled to native sidecar metadata.
- Native tombstones are not currently handled by the MCP sidecar scanner.
- The MCP server uses a minimal hand-written JSON-RPC stdio loop rather than a
  full official SDK integration.
- Tool argument validation and malformed JSON handling are minimal.
- Results are chunk-level, not note-deduplicated.
- Response-size limits, stale-file detection, and automatic index reload are
  not implemented.
- Multi-shard and multi-device behavior has source-aligned code but lacks broad
  committed regression coverage.
- The sign-bit candidate-generation path from Seek is not yet copied into the
  live MCP search path.

## Update procedure

When Seek changes:

1. Compare the pinned Seek commit with the new Seek commit.
2. Diff `src/quant.ts`, `src/sidecar.ts`, `src/binary.ts`, model metadata,
   relevant types, and IndexedDB read/schema code.
3. Port matching format-sensitive blocks into the MCP compatibility modules,
   retaining Seek names, constants, structure, comments, and harmless helpers
   where practical.
4. Keep Node filesystem and MCP-specific code clearly outside those blocks.
5. Update `UPSTREAM.md`, `NOTICE.md`, fixtures, and format gates.
6. Run MCP build/tests, Seek typecheck/tests, and real-export validation.

Do not guess at an unknown sidecar format. Reject it, inspect the new Seek
source, and update the compatibility layer deliberately.
