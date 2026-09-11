# Obsidian Seek MCP TODO

This list reflects the current working baseline, not the abandoned Chromium
sidecar detour. The old sidecar branch is considered burned history and should
not be treated as an active implementation target.

## Active work

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

## Historical detour (burned)

These items describe the Chromium sidecar branch and should be treated as
warning markers only. They are not active requirements for the repo.

- [x] Investigate Chromium launch and CDP handshake.
- [x] Debug the self-message bug in the sidecar transport.
- [x] Confirm strict WebGPU fails on the target phone.
- [x] Observe the real plugin runtime: q4 WASM with plain ORT glue and a proxy
  worker.
- [x] Record the split point and recovery map in the handoff docs.

## Baseline implementation already complete

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

## Compatibility maintenance

- [x] `[critical]` Pin and record the Seek source commit used by compatibility
  code: `1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd`.
- [ ] `[critical]` Compare model, quantization, and IndexedDB changes before
  every Seek update.
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
The default backend remains direct Wasm, not a Chromium sidecar branch.

## Commands

```sh
npm ci
npm run build
npm test
git diff --check
```

The MCP server is started with `npm start`. PicoClaw calls tools with
`vaultDir`; do not configure `SEEK_EXPORT_DIR`.
