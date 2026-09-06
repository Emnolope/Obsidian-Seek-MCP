# Obsidian-Seek-MCP
# Obsidian Seek MCP

This repository contains the read-only MCP consumer for a complete export from
the Seek Obsidian plugin. The companion exporter is in the Seek source checkout
at `/workspaces/Obsidian-Seek`; Obsidian exposes it as **Seek: Export complete
MCP index**.

## Run

The server reads `SEEK_EXPORT_DIR` (or the first positional argument), defaulting
to `./Seek Index`:

```sh
npm install
SEEK_EXPORT_DIR="/path/to/Seek Index" npm start
```

It exposes `index_status`, `semantic_search`, `fetch_chunk`, and `fetch_note`
over MCP stdio. The directory must contain Seek's native sidecar files and its
`MCP Export/` document mapping. `semantic_search` accepts either `queryText` or
a precomputed `queryVector`; the local adapter uses Seek's model, revision,
CLS pooling, normalization, and 384-dimensional output. The document records
retain Seek's quantized `q`/`s` tier; the server dequantizes it using the
vendored Seek-compatible implementation.

When `queryText` is supplied by the MCP caller, the server vectorizes that text
locally with the Seek-compatible adapter and compares the resulting vector to
the already-indexed paragraph vectors. Retrieved paragraphs are not embedded a
second time.

The server is intentionally read-only. It does not edit notes, run Git, or
modify Seek's index.

## Current loader behavior

The loader preserves strict validation for malformed records, invalid paths,
dimension mismatches, and CRC failures. It tolerates a stale document mapping
that has no matching native vector: that mapping is skipped and reported by
`index_status` instead of preventing usable pairs from being searched. The
diagnostics include `exportedDocuments`, `loadedDocuments`,
`skippedDocuments`, and `orphanVectors`.

The key architectural rule is that the export is not a rival generation
pipeline. It is a read-only view of the same successful Seek indexing commit.
The vector payload, the file/chunk mapping, and the document metadata must be
published together. If they are split across generations, the loader treats the
result as stale or incomplete instead of pretending it is a valid atomic export.

The first natural-language query loads the pinned Granite model through
`@huggingface/transformers` and may download it into the local model cache.
Later queries reuse the in-process pipeline. The Node adapter uses CPU
execution; Seek's browser-side WASM runtime is not used by the MCP process.

The real synchronized `system-vault` export is separate from this repository.
Its current export contains 6,735 document records and 6,736 native locator
records, so a full consistency check remains an explicit validation task.

The next change belongs in the separate `/workspaces/Obsidian-Seek` plugin
checkout. Couple MCP export generation to the successful semantic indexing
commit so the document mapping and native vector sidecar come from the same
generation. This is the same atomic-commit rule as the soup-kitchen analogy:
the meal does not count as served if the soup, bowl, and spoon arrive at
different times or from different kitchens.

Make this addition deliberately obvious in source: use clearly named
MCP/export helpers, a visibly marked integration block at the indexing call
site, and concise rationale comments for the coupling and atomic commit
boundary. Do not hide the behavior inside generic vector math or silently
rewrite Seek's embedding calculations. The result must be easy to audit in a
normal diff by a human, a diff parser, or a future AI maintainer.

The first natural-language query loads the pinned Granite model through
`@huggingface/transformers` and may download it into the local model cache.
Later queries reuse the in-process pipeline. The Node adapter uses CPU
execution; Seek's browser-side WASM runtime is not used by the MCP process.

The real synchronized `system-vault` export is separate from this repository.
Its current export contains 6,735 document records and 6,736 native locator
records, so a full consistency check remains an explicit validation task.
