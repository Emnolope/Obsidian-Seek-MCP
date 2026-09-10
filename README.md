# Obsidian-Seek-MCP

Human-facing usage is documented below. Agent-to-agent maintenance guidance,
project context, and the current unfinished handoff live in
[`HANDOFF.md`](HANDOFF.md) and [`CONTEXT.md`](CONTEXT.md).

This repository contains the read-only MCP consumer for a complete export from
the Seek Obsidian plugin. The companion exporter is in the Seek source checkout
at `/workspaces/Obsidian-Seek`; Obsidian exposes it as **Seek: Export complete
MCP index**.

The current published MCP release is `Obsidian-Vault-MCP-v4`. The working tree
also includes a read-only CLI for direct status, search, chunk, and note checks;
the CLI is not part of that published release yet.

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

The compatibility contract is documented in
[`src/SEEK-COMPATIBILITY.md`](src/SEEK-COMPATIBILITY.md) and implemented by
[`src/seek-compatibility.ts`](src/seek-compatibility.ts). The default query
backend is WASM. Set `SEEK_MCP_DEVICE=auto` to attempt the optional WebGPU path
and fall back to WASM, or set `SEEK_MCP_DEVICE=webgpu` to require the Chromium
sidecar and fail instead of silently falling back. The sidecar launches the
Chromium binary named by `SEEK_CHROMIUM_PATH`, serves the existing Seek browser
child script, and is intended to return only the 384-value query vector over
the DevTools Protocol. On the OnePlus 6T, the sidecar transport reaches
ORT-Web, but strict q4 WebGPU fails with an invalid external Dawn instance.
Seek's working plugin report shows that the phone uses q4 WASM with plain glue
and a proxy worker; browser-hosted WASM is the next sidecar target.
Chromium owns browser Transformers.js/ORT-Web execution; Node owns MCP
transport, vault loading, and ranking. Backend choice changes execution
environment and speed, not the model/vector-space contract.

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

## Device tests

Phone-specific diagnostics live under `device-tests/<device>/`. The current
suite is `device-tests/oneplus-6t/`; run it from the repository root on the
matching Termux device. The scripts currently default generated logs to the
repository root unless `SEEK_PROBE_OUT` is set; keep new logs out of commits.
`test-6.sh` serializes a flat report in the browser before crossing CDP, while
`test-7.sh` captures raw browser console and exception events. The transport
probe is complete enough to diagnose the WebGPU failure; use the existing
scripts as evidence tools, not as proof that strict WebGPU is the phone's
working backend.

Short version: the AI can generate the probe, but the phone owns the execution
and permission boundary. A server-side VM is not a phone and cannot claim a
WebGPU or Chromium result on the user's device. The proof must come from the
actual device, then be reported back through the repo.

## CLI

The same loader and search implementation is available for direct human or
scripted checks:

```sh
npm run cli -- status /path/to/vault
npm run cli -- search /path/to/vault "meeting notes about embeddings" --top-k 5
npm run cli -- chunk /path/to/vault CHUNK_ID
npm run cli -- note /path/to/vault Projects/example.md
```

Add `--json` to any command for machine-readable output. Search also accepts a
precomputed vector with `--vector`; it must contain 384 comma-separated values
or a JSON array. The CLI uses the same hidden-then-visible vault resolution as
the MCP server and never writes to the vault.

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

The first natural-language query loads the pinned Granite model through the
vendored Seek-compatible Transformers.js web bundle and may download it from
the model host. Later queries reuse the in-process pipeline. The default MCP
adapter selects the same WASM execution path and plain glue variant that Seek
uses on Android; it does not install or import `onnxruntime-node`. The strict
`webgpu` mode is the Chromium browser path, not a Node WebGPU approximation.
Phone validation in Termux found no Node `navigator.gpu`, no published Android
ARM64 Dawn binary, and no Android-compatible `onnxruntime-node` package. After
installing the web runtime's declared common dependency, the browser-oriented
WASM loader still reached a Node-incompatible `blob:` module URL. The next
runtime boundary is therefore the Chromium sidecar for the phone's browser-WASM
path; it preserves Seek's browser-compatible runtime and does not change the
model/vector compatibility contract. Strict WebGPU remains an explicit,
experimental path rather than the phone default.

The real synchronized `system-vault` export is separate from this repository.
Its current export contains 6,735 document records and 6,736 native locator
records, so a full consistency check and exporter correction remain explicit
validation tasks.

The next exporter change belongs in the separate plugin checkout: make the MCP
export destination follow the selected hidden or visible sidecar location while
retaining the successful-commit boundary. Keep that integration explicit and
diff-friendly; do not alter Seek's embedding calculations. After that, add
resolver and MCP protocol tests, then bound search and fetch responses.
