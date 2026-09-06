# Obsidian Seek MCP Blueprint

## Runtime flow

```text
PicoClaw -> MCP stdio -> tool(vaultDir, arguments)
                         -> check hidden Seek index
                         -> check visible Seek Index fallback
                         -> load native sidecar + MCP manifest
                         -> embed queryText or use queryVector
                         -> cosine-score vectors
                         -> return ranked chunks
```

The vault directory is the only storage path exposed to the agent. The server
owns the knowledge of Seek's two supported locations.

## Tool contract

```text
index_status({ vaultDir })
semantic_search({ vaultDir, queryText | queryVector, topK?, pathPrefix? })
fetch_chunk({ vaultDir, chunkId })
fetch_note({ vaultDir, notePath })
```

`semantic_search` accepts either ordinary text or exactly 384 numeric values.
Text uses the pinned Seek-compatible Granite model through the copied
Transformers.js web bundle and the Seek-compatible WASM runtime path.
The default result limit is 10 and the allowed range is 1 through 100.

## Location resolution

For a vault root, the server tries:

```text
<vaultDir>/.obsidian/plugins/seek/index
<vaultDir>/Seek Index
```

The hidden location is preferred. Both the native sidecar files and
`MCP Export/export.meta.json` plus `MCP Export/documents.jsonl` must be present
under the selected location. The plugin currently writes the MCP manifest to
the hidden location unconditionally; fixing that producer-side mismatch is the
next critical change for complete visible-mode support.

## Export contract

The native sidecar remains the vector source:

```text
q:384 signed int8 bytes
s:8-byte little-endian float64
sign:48 packed sign-bit bytes
crc:4-byte little-endian CRC-32
```

The MCP manifest contains the explanatory document layer:

```json
{
  "chunkId": "...",
  "notePath": "Projects/example.md",
  "title": "Example",
  "content": "The chunk text",
  "chunkIndex": 0,
  "mtime": 0
}
```

The exporter must publish the manifest beside the same native sidecar location
and only after the successful Seek indexing commit. It must not calculate a
second vector representation or maintain a competing index state machine.

## Deliberate boundaries

- MCP is read-only; no note writes, Git commands, or reindexing.
- Search is currently a correctness-first full scan.
- Results are chunk-level and are not yet grouped by note.
- Stale mappings without native locators are skipped and reported.
- Malformed records, invalid paths, dimension mismatches, and CRC failures are
  errors.
- A read-only CLI calls the same vault resolver and `SeekIndex` APIs for direct
  status, search, chunk, and note checks.
- Automatic reload, tombstones, and response-size limits are future work.
