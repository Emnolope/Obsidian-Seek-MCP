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

## Performance postmortem

The MCP core was operational before the Chromium sidecar was introduced. Its
query embedding appeared roughly one-half to one-quarter as fast as the Seek
plugin, but no controlled benchmark established GPU versus CPU as the cause.
The plugin report for the OnePlus 6T records `gpuAvailable: false`,
`requestAdapter returned null`, and successful q4 WASM with plain glue and a
proxy worker. The comparison was therefore between different browser/Node
hosts, worker placement, startup state, and probably batching, not equivalent
GPU and CPU runs.

The sidecar was justified as a browser-runtime escape hatch because Node could
not load the browser runtime's `blob:` module URL. The implementation mistake
was treating strict WebGPU as the performance answer before reproducing Seek's
actual WASM arrangement. The sidecar's CDP self-message bug was real and fixed,
but the strict WebGPU experiment then exposed a separate q4/Dawn failure. This
does not invalidate the MCP core. The next measurement is a controlled
browser-WASM comparison; the sidecar remains optional.

## Commit recovery map

The repository history provides explicit recovery points:

| Commit | Meaning |
| --- | --- |
| `74f2853` | Initial MCP Seek-compatible query-WASM port. |
| `2978012` | Clean compatibility/query milestone before later device and sidecar work. |
| `e1e8732` | Exact parent of the first sidecar commit; last mainline state before `src/chromium-sidecar.ts` entered the branch. |
| `3e093b3` | First Chromium WebGPU sidecar probe and beginning of the GPU detour. |
| `24eee41` | Beginning of heavy sidecar/debug instrumentation. |
| `9750e26` | Large diagnostic expansion in `src/chromium-sidecar.ts`. |
| `695d3d5` | Isolated fix preventing outgoing page RPCs from being read as replies. |

Recovery should start from `e1e8732` for the core, then selectively reapply the
sidecar boundary and `695d3d5` if browser hosting is still desired. Do not
cherry-pick the debug expansion commits as a group. Reconcile
`query-embedder.ts` against the pre-sidecar version and reintroduce
browser-hosted WASM deliberately.

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

The decisive sidecar artifact was
`chromium-sidecar-diagnostics-20260910-153700.log`. It recorded a successful
browser model-load response with `device: webgpu`, `dtype: q4`, approximately
23 seconds of cold start, and approximately 559 ms of warmup before the first
real embed failed. Seek's warmup loop catches individual inference failures, so
those timings prove session setup reached the runtime but do not prove that the
warmup computations succeeded. The first uncaught embed failed at the q4
embedding-table gather. No explicit `webgpu-device-lost` or
`webgpu-uncaptured-error` event was captured.

The plugin evidence is in `device-tests/oneplus-6t/seek-report.json` and its
summary. It records `gpuAvailable: false`, `requestAdapter returned null`,
actual device `wasm`, dtype `q4`, glue `plain`, and `proxy: true`. Its reported
cold start was approximately 32.5 seconds, with stable heap and approximately
99.5 MB of model storage growth. This is the reference runtime arrangement for
the next sidecar experiment.

The next browser-WASM experiment should preserve the following exact contract:

1. Request `wasm`, never WebGPU, in the browser child.
2. Apply Seek's plain-glue replacement from
  `ort-wasm-simd-threaded.asyncify.*` to `ort-wasm-simd-threaded.*`.
3. Keep model, revision, q4 dtype, CLS pooling, normalization, max length 128,
  and output dimension 384 unchanged.
4. Prove one direct browser-page embedding before attempting a worker transfer.
5. Report backend, glue, cold start, embedding latency, dimension, finite values,
  and finite non-zero norm.
