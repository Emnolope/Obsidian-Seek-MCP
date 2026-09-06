# Obsidian Seek MCP Context

## Goal

Give PicoClaw read-only semantic retrieval over one or more Obsidian vaults by
reusing embeddings produced by the Seek plugin. The agent supplies a vault
directory; it does not need to know Seek's index directory or storage format.

The intended topology is:

```text
human vault -> Seek indexes notes -> Git sync -> agent vault copy
                                              -> MCP server -> PicoClaw
```

The agent copy is the read-side safety boundary. This MCP server does not edit
notes, run Git, reindex Seek, or mutate the human source-of-truth vault.

## Current architecture

The MCP server is a Node/TypeScript stdio process. It exposes one stable tool
set for every vault:

- `index_status`
- `semantic_search`
- `fetch_chunk`
- `fetch_note`

Every tool receives `vaultDir`. The server resolves and tries these Seek
locations in order:

1. `<vaultDir>/.obsidian/plugins/seek/index`
2. `<vaultDir>/Seek Index`

The first location is Seek's hidden/default sidecar location. The second is
Seek's visible vault-root option. Indexes are loaded lazily and cached by the
resolved vault directory, so different vaults use the same tools and process.

## Export boundary

Seek keeps its working index in IndexedDB and writes a portable sidecar. The
MCP server cannot depend on private IndexedDB access, so it reads the native
sidecar plus the MCP document manifest. The native binary sidecar supplies
quantized vectors; the manifest supplies chunk IDs, note paths, titles, text,
and chunk metadata.

The plugin now has a successful-commit hook that calls its named MCP exporter.
The exporter joins Seek metadata, bodies, file mappings, and quantized vectors,
then writes the document manifest through a temporary directory and renames it
into place. This is a read-side export, not a second embedding or indexing
algorithm.

## Important current limitation

Seek's sidecar location is configurable, but the current plugin exporter writes
`MCP Export/` to the hidden path
`.obsidian/plugins/seek/index/MCP Export`. Therefore visible-mode support is not
fully coherent yet: a visible native sidecar can be paired with a hidden MCP
manifest, or the MCP resolver can find a native sidecar without its manifest.
The next plugin change must derive the MCP export directory from the same
configured sidecar location used for native files.

## Verified baseline

The current MCP repository is commit `4b53ec3`, published as
`Obsidian-Vault-MCP-v4`. The plugin checkout is commit
`06b837126f66d54db97ef8785a7c95750e48c311`.

The available real system-vault data currently shows:

- visible native locator records: 6,736
- visible MCP document records: 6,735
- hidden native locator records: 6
- model: `tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX`
- revision: `54db88c5667bd79b4aea24ea6027a7ef45a7bbb5`
- dimension: `384`
- sidecar format: `3`

The 6,735/6,736 mismatch is real and remains a diagnostic/recovery case, not
evidence of a complete export. A fresh export after fixing the location
coupling must be validated end to end.

## Scope boundaries

The current server supports natural-language query embedding with the pinned
Seek-compatible model, or a caller-supplied 384-value query vector. Search is a
full scan and returns chunk-level hits. A read-only CLI now uses the same vault
loader and index APIs for status, search, chunk, and note checks. Note-level
grouping, response bounds, automatic reload, and tombstone handling are not
implemented yet.

## Compatibility philosophy

Seek-derived code and MCP code have different ownership even though they are
fully integrated at runtime. Keep copied Seek blocks and snapshots visibly
separate, preserve their upstream layout, naming, ordering, comments, and
control flow, and mark every necessary adaptation at a narrow boundary. The
priority is the smallest edit distance from Seek, not the smallest amount of
copied code. Copying extra upstream functions is good when it keeps the port
mechanically comparable. Do not refactor copied code into local style or mix
unrelated MCP behavior into it.

This minimizes the diff footprint. Updating compatibility code should be a
mechanical comparison task: identify the copied block, inspect that block in
the newer Seek source, and replace the local block with the updated version.
The source path and pinned commit must make that comparison possible without
requiring a maintainer to reverse-engineer or redesign the algorithm first.

The implementation preference is intentionally broad: copy the largest
relevant Seek file or block that can be integrated, then adapt its imports and
platform edges. Do not extract only the few lines that seem necessary and
rebuild the surrounding behavior from memory. A larger wholesale copy is
better when it keeps the plugin's behavior and update path obvious; MCP code
belongs around that copy as a wrapper or at clearly marked boundaries.
