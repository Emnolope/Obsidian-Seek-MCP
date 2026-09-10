# Seek/MCP Technical Investigation

Last verified: 2026-09-10

This file records verified implementation facts. The rationale belongs in
`CONTEXT.md`; ordered work belongs in `TODO.md`.

## Repository versions

- MCP repository: `/workspaces/Obsidian-Seek-MCP`
- MCP commit/release: `main` includes the experimental sidecar and the
  self-message fix `695d3d5`; `Obsidian-Vault-MCP-v4` remains the published
  baseline
- Seek checkout: `/workspaces/Obsidian-Seek`
- Seek plugin commit: `06b837126f66d54db97ef8785a7c95750e48c311`
- Compatibility source commit: `1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd`

## Current data flow

```text
Seek IndexedDB
  -> plugin MCP exporter
  -> native sidecar + MCP document manifest
  -> Git sync to agent vault
  -> MCP resolves vaultDir and loads one matching location
  -> cosine ranking
  -> PicoClaw
```

The server is read-only. It does not access IndexedDB directly.

## Location facts

Seek's native sidecar setting supports:

- hidden: `.obsidian/plugins/seek/index`
- visible: `Seek Index`

The MCP server tries both locations for a supplied vault root. However,
`/workspaces/Obsidian-Seek/src/mcp-export.ts` currently defines:

```text
.obsidian/plugins/seek/index/MCP Export
```

unconditionally. This means visible-mode native files and the MCP manifest can
be split across locations. The resolver's fallback is implemented, but the
producer-side visible-mode contract is not complete.

## Real data observed

Under `/workspaces/system-vault`:

- visible native locator file: 6,736 lines
- visible MCP document manifest: 6,735 lines
- hidden native locator file: 6 lines
- visible export metadata reports `chunkCount: 6735`
- model ID: `tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX`
- revision: `54db88c5667bd79b4aea24ea6027a7ef45a7bbb5`
- chunker version: `10`
- dimension: `384`
- sidecar format: `3`

The older notes' claims of 6,729 usable pairs, 6 skipped mappings, and 7
orphan locators describe an earlier loader run. They must not be treated as
the current measured baseline without rerunning the loader against the current
files.

## Native format

The format-3 record is 444 bytes: 384 signed int8 quantized values, an 8-byte
float64 scale, 48 sign bytes, and a 4-byte IEEE CRC-32 over the first 440 bytes.
The MCP compatibility layer reconstructs vectors as `q[i] * s` and validates
dimensions, offsets, shard paths, and CRCs.

## MCP implementation

`src/index.ts` loads one resolved Seek index into memory and performs a linear
cosine scan. `src/server.ts` provides the stdio JSON-RPC loop, resolves
`vaultDir` against hidden then visible locations, and caches indexes by resolved
vault path. `src/query-embedder.ts` handles natural-language queries using the
pinned model and the copied Transformers.js web/WASM execution path. The
model/vector contract and backend policy are paired in
`src/SEEK-COMPATIBILITY.md` and `src/seek-compatibility.ts`; WASM is the
default, `SEEK_MCP_DEVICE=auto` attempts WebGPU with fallback, and
`SEEK_MCP_DEVICE=webgpu` is strict.

The working tree also contains a read-only CLI that uses the same vault
resolver, index loader, and query embedder as the MCP server. An older phone
run loaded 6,729 documents, skipped 6 mappings, and found 7 orphan vectors out
of 6,735 exported documents. Treat those counts as historical until the loader
is rerun against the current files. A synthetic 384-value vector search
completed across that earlier loaded set. There is no official MCP SDK
dependency; transport is a small hand-written stdio loop.

## Validation baseline

The MCP repository's current checks are:

```sh
npm run build
npm test
git diff --check
```

The committed tests cover CRC-protected fixture loading, cosine ranking, and
note path traversal rejection. Hidden/visible resolver behavior and full MCP
protocol behavior still need tests. Phone-side `test-1` through `test-4` were run in
Termux on Android arm64: Node has no `navigator.gpu`; published Dawn has no
Android ARM64 binary; official `onnxruntime-node` rejects Android; and the
pinned web runtime's declared `onnxruntime-common@1.24.0-dev.20251116-b39e144322`
installs, but the real embedder fails on Node with
`ERR_UNSUPPORTED_ESM_URL_SCHEME` for a `blob:` module URL. No vector or
throughput result was produced by those tests. Phone-side `test-5.sh` later
confirmed Chromium `149.0.7827.155` launches at
`/data/data/com.termux/files/usr/bin/chromium-browser` and reaches the browser
embedding path, but the CDP return payload was malformed. `test-6.sh` and
`test-7.sh` then captured the raw payload and console events and exposed a
sidecar self-message bug; commit `695d3d5` fixed it.

After that fix, the device reached ORT-Web model execution. Strict q4 WebGPU
failed in `GatherBlockQuantized` with `A valid external Instance reference no
longer exists`. The separate Seek plugin report shows the actual working phone
path is q4 WASM, plain glue, and a proxy worker; its WebGPU adapter is
unavailable. A valid 384-value sidecar result remains unverified because the
sidecar has not yet implemented the browser-WASM mode.
