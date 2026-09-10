# Obsidian Seek MCP TODO

This list reflects the current implementation, not the original project
handoff. Complete the critical items in order.

## Next actions

- [ ] `[critical]` Fix the Seek exporter to write `MCP Export/` beside the
  native sidecar selected by `sidecarIndexLocation` (`.obsidian/plugins/seek/index`
  or `Seek Index`), rather than always using the hidden path.
- [ ] `[critical]` Generate fresh exports in both plugin location modes and
  validate that native sidecars and MCP manifests are found in the same vault
  location.
- [ ] `[critical]` Run the PicoClaw stdio smoke test against a fresh agent-vault
  copy using `vaultDir`, not `SEEK_EXPORT_DIR`.
- [ ] `[critical]` Add a server test for hidden lookup, visible fallback, and
  the error when neither location contains a valid export.
- [ ] `[critical]` Add protocol tests for `initialize`, `tools/list`, tool calls,
  malformed JSON, unknown tools, and invalid arguments.
- [ ] `[critical]` Bound search and fetch response sizes before relying on the
  server for large notes and PicoClaw context.
- [x] `[critical]` Build the smallest Chromium sidecar boundary for query
  embedding, preserving the copied Seek browser runtime and defining a
  browser-to-Node vector boundary.
- [x] `[critical]` Run the device diagnostics and inspect the flat/raw reports.
  The reports proved Chromium launch, child readiness, and the initial CDP
  boundary; they also exposed the self-message bug.
- [x] `[critical]` Make and validate the smallest transport fix required by the
  observed result. Commit `695d3d5` ignores outgoing page requests that were
  being mistaken for child replies.
- [ ] `[critical]` Add a browser-hosted WASM sidecar mode matching Seek's phone
  path: q4, plain ORT glue, and a 384-value vector across CDP.
- [ ] `[critical]` Run the browser-WASM device test and require dimension 384,
  finite values, finite non-zero norm, and measured latency.

## Current implementation already complete

- [x] Read-only MCP stdio server.
- [x] One stable tool set across arbitrary vault directories.
- [x] Hidden-then-visible Seek location lookup.
- [x] Lazy per-vault index loading and caching.
- [x] Natural-language and precomputed-vector search inputs.
- [x] Read-only CLI using the shared vault loader and `SeekIndex` APIs.
- [x] Seek-compatible model, revision, pooling, normalization, and dimension.
- [x] Native sidecar CRC, dimension, offset, and path validation.
- [x] Stale document mappings are skipped and reported by `index_status`.
- [x] Published MCP release `Obsidian-Vault-MCP-v4`.

## Retrieval quality and operations

- [ ] `[important]` Group chunk hits by note and preserve the best-scoring
  chunks per note.
- [ ] `[important]` Report model, revision, dimensions, shard counts, and all
  mismatch/invalid-record diagnostics in the health response.
- [ ] `[important]` Detect Markdown changes since export generation.
- [ ] `[important]` Handle Seek tombstones and mixed-device winner rules with
  committed fixtures.
- [ ] `[optional]` Add sign-bit candidate generation and reranking.
- [ ] `[optional]` Reload a vault when its export generation changes.
- [x] Add a CLI that calls the same `SeekIndex` library as MCP.

## Phone runtime findings

- [x] Confirm Android/Termux Node lacks `navigator.gpu`.
- [x] Confirm published Dawn Node WebGPU lacks an Android ARM64 binary.
- [x] Confirm official `onnxruntime-node` rejects Android.
- [x] Install the pinned web runtime's declared `onnxruntime-common` version.
- [x] Confirm the browser-oriented WASM path fails on Node at `blob:` module
  loading before producing an embedding.
- [x] Choose Chromium sidecar IPC over a custom Android native build for the
  experimental browser boundary.
- [x] Confirm the phone's working Seek plugin backend is q4 WASM with plain
  glue and a proxy worker; strict WebGPU is unavailable on that plugin host.
- [ ] Port that browser-WASM execution mode into the sidecar before treating
  phone query embedding as validated.

The Chromium sidecar choice has now been implemented experimentally. Its CDP
return boundary is corrected, but its strict WebGPU mode fails on the phone.
Do not reopen the native-build question; implement and test the browser-WASM
mode first.

## Compatibility maintenance

- [x] `[critical]` Pin and record the Seek source commit used by compatibility
  code: `1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd`.
- [ ] `[critical]` Compare sidecar, model, quantization, and IndexedDB changes
  before every Seek update.
- [ ] `[critical]` Update `UPSTREAM.md`, `NOTICE.md`, fixtures, and format gates
  whenever a compatibility-affecting Seek change is ported.
- [ ] `[critical]` Run MCP build/tests, Seek typecheck/tests, and fresh hidden
  and visible export validation after format or lifecycle changes.

## Compatibility contract

The English specification and executable compatibility boundary are deliberately
paired in the same directory:

- `src/SEEK-COMPATIBILITY.md` is the human/AI porting procedure and source of
  truth for the tensor pathway.
- `src/seek-compatibility.ts` is the compact implementation of the pinned model,
  backend policy, and vector post-processing contract.

Update both in the same change. Preserve the largest recognizable Seek block
first, adapt platform edges second, and trim only after numerical validation.
The default backend is WASM; `SEEK_MCP_DEVICE=auto` attempts WebGPU with
fallback, and `SEEK_MCP_DEVICE=webgpu` is strict.

## Commands

```sh
npm ci
npm run build
npm test
git diff --check
npm --prefix /workspaces/Obsidian-Seek run typecheck
npm --prefix /workspaces/Obsidian-Seek test
```

The MCP server is started with `npm start`. PicoClaw calls tools with
`vaultDir`; do not configure `SEEK_EXPORT_DIR`.
