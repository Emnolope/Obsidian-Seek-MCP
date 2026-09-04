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
`MCP Export/` document mapping. `semantic_search` currently accepts a precomputed query vector;
the embedding adapter must use the model and dimension recorded in
`export.meta.json`. The document records retain Seek's quantized `q`/`s` tier;
the server dequantizes it using the vendored Seek-compatible implementation.

The server is intentionally read-only. It does not edit notes, run Git, or
modify Seek's index.
