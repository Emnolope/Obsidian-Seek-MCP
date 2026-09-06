# Obsidian-Seek-MCP
# Obsidian Seek MCP

This repository contains the read-only MCP consumer for a complete export from
the Seek Obsidian plugin. The companion exporter is in the Seek source checkout
at `/workspaces/Obsidian-Seek`; Obsidian exposes it as **Seek: Export complete
MCP index**.

The current MCP release is `Obsidian-Vault-MCP-v4`. There is no CLI in this
release; the package currently provides the MCP stdio server only.

## Run

The server is a single multi-vault MCP process. It does not bind to one vault
at startup. Each tool call supplies a `vaultDir` pointing to an Obsidian vault:

```sh
npm install
npm start
```

It exposes `index_status`, `semantic_search`, `fetch_chunk`, and `fetch_note`
over MCP stdio. Every tool accepts `vaultDir`, which may be an absolute or
relative path anywhere the process has filesystem access. The server checks
Seek's hidden default index directory,
`<vaultDir>/.obsidian/plugins/seek/index`, first and then the supported visible
fallback, `<vaultDir>/Seek Index`; the caller never needs to know which plugin
setting is active.
`semantic_search` accepts either `queryText` or a precomputed `queryVector`; the
local adapter uses Seek's model, revision, CLS pooling, normalization, and
384-dimensional output. The document records retain Seek's quantized `q`/`s`
tier; the server dequantizes it using the vendored Seek-compatible
implementation.

The current Seek exporter writes `MCP Export/` under the hidden path
unconditionally. The visible fallback is therefore a resolver capability, not
proof that visible-mode exports are currently produced coherently. Until the
plugin exporter derives its destination from the selected setting, use hidden
mode or validate the generated files manually.

Indexes are loaded lazily and cached by their resolved vault, so the same
four MCP tools work across any number of vaults without registering separate
tool names or separate MCP servers. `vaultDir` is the only path exposed to the
agent; the operating system still controls which directories the PicoClaw
process can read.

For example, a PicoClaw registration needs only the server command:

```sh
picoclaw mcp add --force --no-deferred obsidian-seek -- \
	node --experimental-strip-types \
	/path/to/Obsidian-Seek-MCP/src/server.ts
```

PicoClaw then supplies a different `vaultDir` when it calls the same
`semantic_search`, `fetch_note`, or `fetch_chunk` tool.

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
records, so a full consistency check and exporter correction remain explicit
validation tasks.

The next change belongs in the separate plugin checkout: make the MCP export
destination follow the selected hidden or visible sidecar location while
retaining the successful-commit boundary. Keep that integration explicit and
diff-friendly; do not alter Seek's embedding calculations.
