# Obsidian Seek MCP TODO

This list is ordered by dependency and timeline. Complete earlier items before later items unless a task is explicitly marked optional.

Priority tags:

- `[critical]` Required for a usable and trustworthy release.
- `[important]` Strongly recommended for a solid release, but not an immediate blocker.
- `[optional]` Useful later improvement that can be deferred.

## Immediate: establish a working end-to-end path

- [x] `[critical]` Generate a complete export from the modified Seek plugin using **Seek: Export complete MCP index**.
- [x] `[critical]` Confirm the export layout contains Seek's native `meta.*.json`, `index.*.jsonl`, and `embeddings.*.bin` files plus `MCP Export/export.meta.json` and `MCP Export/documents.jsonl`.
- [ ] `[critical]` Run the MCP loader against the real export and verify that every vector ID resolves to a document, note path, title, and chunk body.
- [ ] `[critical]` Validate all real sidecar records: dimensions, offsets, shard paths, binary lengths, and CRC32 checks.
- [x] `[critical]` Verify the two-vault Git workflow: human vault exports, Git synchronizes, agent vault pulls, and the MCP server remains read-only.
- [x] `[critical]` Add a local query-embedding adapter that uses the exact Seek model, revision, tokenizer, preprocessing, pooling, normalization, and 384-dimensional output.
- [x] `[critical]` Add natural-language query support to `semantic_search` while retaining precomputed-vector input for diagnostics and tests.
- [ ] `[critical]` Verify that PicoClaw can launch the MCP process over stdio and successfully call `initialize`, `tools/list`, and `semantic_search`.

## Core correctness and consistency

- [ ] `[critical]` Make the next Seek plugin integration visibly diff-friendly:
  isolate MCP/export additions in clearly named functions or blocks, retain
  explicit `MCP EXPORT` markers and short rationale comments, and keep the
  indexing-to-export call site obvious to human and automated reviewers.
- [ ] `[critical]` Add generation coupling between the native Seek sidecar and `MCP Export` manifest so vectors and document mappings cannot silently come from different builds.
- [ ] `[critical]` Reject stale, incomplete, or mixed-generation exports with a clear diagnostic.
- [ ] `[critical]` Confirm MCP result content is bounded so a large note cannot overwhelm PicoClaw's context window.
- [ ] `[critical]` Ensure all path-based operations reject absolute paths, traversal, encoded traversal, and invalid separators.
- [ ] `[critical]` Confirm the MCP server performs no note writes, Git operations, reindexing, or mutations of the source-of-truth vault.
- [ ] `[important]` Group or deduplicate chunk-level search hits by note so one note cannot consume the entire result set.
- [ ] `[important]` Add a health-check path reporting model, revision, format, dimension, vector count, document count, shard count, and invalid-record counts.
- [ ] `[important]` Detect and report when Markdown files have changed since the exported index was generated.

## Tests and fixtures

- [ ] `[critical]` Add a committed real-format fixture containing metadata, JSONL locators, a CRC-protected binary shard, and document mappings.
- [ ] `[critical]` Add tests for CRC corruption and truncated binary records.
- [ ] `[critical]` Add tests for multi-shard offsets and shard sequence resolution.
- [ ] `[critical]` Add tests for missing mappings, duplicate IDs, dimension mismatches, malformed records, and count mismatches.
- [ ] `[critical]` Add tests for stale sidecar formats and generation mismatches.
- [ ] `[critical]` Add tests for multiple device JSONL files and Seek's per-device/cross-device winner rules.
- [ ] `[important]` Add MCP protocol tests for initialization, tool listing, tool calls, notifications, malformed JSON, unknown methods, unknown tools, and invalid arguments.
- [ ] `[important]` Run the complete real-vault validation after each export-format change.
- [ ] `[important]` Add a comparison test proving MCP vector reconstruction and cosine scores agree with Seek within the expected quantization tolerance.

## Deployment and mobile validation

- [ ] `[important]` Document Node.js, `npm ci`, `SEEK_EXPORT_DIR`, working-directory, and PicoClaw configuration requirements.
- [ ] `[important]` Test cold startup, memory use, export size, and search latency on the OnePlus 6T/Termux environment.
- [ ] `[important]` Document the explicit export, commit, Git sync, pull, and MCP restart workflow.
- [ ] `[important]` Define recovery steps for stale exports, partial syncs, CRC failures, and model/version mismatches.
- [ ] `[optional]` Add automatic MCP reload when the synced export generation changes.

## Performance and retrieval quality

- [ ] `[optional]` Cache decoded vectors and document mappings across MCP requests.
- [ ] `[optional]` Reload only when export metadata or relevant file signatures change.
- [ ] `[optional]` Copy Seek's sign-bit candidate-generation path (`packSignBits`, `scoreAsymmetric`, `topNIndices`, and `binaryCandidates`) after correctness is established.
- [ ] `[optional]` Add candidate generation followed by quantized-vector reranking for larger vaults.
- [ ] `[optional]` Benchmark full-scan versus candidate-generation performance on the phone.
- [ ] `[optional]` Add hybrid lexical search if natural-language semantic retrieval alone is insufficient.

## Seek update maintenance

- [ ] `[critical]` Pin and record the exact Seek source commit used by the compatibility layer.
- [ ] `[critical]` Before each Seek update, compare the old and new versions of `src/quant.ts`, `src/sidecar.ts`, `src/binary.ts`, relevant types, `src/model-registry.ts`, and the IndexedDB schema APIs.
- [ ] `[critical]` Port format-sensitive changes into the corresponding MCP compatibility modules while preserving Seek's names, constants, structure, comments, and harmless helper functions where practical.
- [ ] `[critical]` Update `UPSTREAM.md`, `NOTICE.md`, the pinned commit, and compatibility tests with every upstream port.
- [ ] `[critical]` Reject unknown sidecar formats rather than guessing how to decode them.
- [ ] `[important]` Keep copied or closely adapted blocks visibly separated from new Node filesystem and MCP code.
- [ ] `[important]` Apply the same visible-boundary rule in the Seek plugin:
  do not bury MCP export behavior inside generic indexing code or silently
  alter vector calculations; make the coupling and every format-sensitive
  change easy to locate in a diff.
- [ ] `[important]` Run MCP build/tests, Seek typecheck/tests, and a real-export validation after every compatibility update.
- [ ] `[optional]` Automate an upstream diff report that highlights changes in the compatibility files and produces a porting checklist.

## Safe takeover commands

Current handoff: plugin deployment, export generation, and vault synchronization
are complete. Query embedding and stale-document tolerance are implemented in
the MCP server, but the real-export smoke check in section 7 remains the next
validation gate. The setup PAT is no longer valid; do not rely on it or
reproduce it.

Before starting:

- The documentation changes in `CONTEXT.md`, `MCP_BLUEPRINT.md`,
  `TODO.md`, `INVESTIGATION.md`, and `UPSTREAM.md` are part of the current
  handoff commit; verify the working tree before making further edits.
- Keep the repositories distinct: this MCP repository is
  `/workspaces/Obsidian-Seek-MCP`; the plugin checkout is
  `/workspaces/Obsidian-Seek`; the real synchronized data is in the separate
  `system-vault` checkout.
- Locate the agent-side `Seek Index` before setting `SEEK_EXPORT_DIR`. It must
  contain both the native sidecars and `MCP Export/`; do not point at
  `MCP Export/` alone and do not test against the human source vault.
- The real export is not duplicated in this MCP repository. It remains in the
  separate synchronized `system-vault` checkout and must be available locally
  before the real-data smoke test can run.

Validation order:

1. Run the build and existing tests.
2. Start the server against the real export and call `index_status` first.
3. Verify the real model ID, revision, format `3`, dimension `384`, and the
  expected count of `6736` chunks.
4. Verify that every exported document ID joins to a native locator and that
  all binary records pass dimension, offset, length, and CRC checks.
5. Exercise `fetch_chunk`, `fetch_note`, and `semantic_search` with a valid
  precomputed 384-value query vector.
6. Only after that consider implementation changes or new features.

The current server embeds text queries locally with the pinned Seek-compatible
adapter and also accepts precomputed query vectors. Remaining known gaps
include generation coupling, tombstones, note-level deduplication, response
bounds, protocol edge-case handling, and automatic reload. The relaxed loader
reports stale mappings but does not replace real-export validation.

Run these from the MCP repository unless a command explicitly changes directory.
They inspect, install, build, test, and compare; they do not write to the vault,
push Git, commit changes, reset files, or modify the separate Seek checkout.

### 1. Identify the active repositories

```sh
pwd
git status --short
git log --oneline --decorate -5
git remote -v
git -C /workspaces/Obsidian-Seek status --short
git -C /workspaces/Obsidian-Seek log --oneline --decorate -5
```

Expected repository roles:

- `/workspaces/Obsidian-Seek-MCP`: external MCP server and compatibility code.
- `/workspaces/Obsidian-Seek`: separate local Seek source checkout; do not push
	or commit its changes unless explicitly requested.

### 2. Install and validate the MCP repository

```sh
npm ci
npm run build
node --experimental-strip-types --test test/*.test.ts
git diff --check
```

`node_modules/` is ignored. `package-lock.json` is authoritative for the MCP
install. The current baseline should report a successful TypeScript build and
two passing tests.

### 3. Validate the Seek source without changing it

```sh
npm --prefix /workspaces/Obsidian-Seek ci
npm --prefix /workspaces/Obsidian-Seek run typecheck
npm --prefix /workspaces/Obsidian-Seek test
```

These commands install dependencies and run checks only. Do not run a build,
reindex, exporter command, or Git operation against the Seek checkout unless the
task explicitly requires it.

### 4. Inspect the current export before starting the server

Set the path to the agent vault's copied index, not the human vault:

```sh
export SEEK_EXPORT_DIR="/path/to/agent/vault/Seek Index"
find "$SEEK_EXPORT_DIR" -maxdepth 2 -type f -print | sort
```

The parent directory must contain both native Seek sidecar files and:

```text
MCP Export/export.meta.json
MCP Export/documents.jsonl
```

Do not point `SEEK_EXPORT_DIR` at `MCP Export/` itself.

### 5. Start the MCP server manually

```sh
SEEK_EXPORT_DIR="$SEEK_EXPORT_DIR" npm start
```

The process speaks MCP over stdin/stdout. Do not write diagnostic text to
stdout; stdout is the protocol channel. Stop it with the normal terminal
interrupt when finished. The current server requires a precomputed 384-value
query vector; ordinary text-query embedding is still a TODO.

### 6. Inspect format-sensitive upstream changes

```sh
git -C /workspaces/Obsidian-Seek diff -- src/quant.ts src/sidecar.ts src/binary.ts src/types.ts src/model-registry.ts src/index-store.ts
diff -u /workspaces/Obsidian-Seek/src/quant.ts src/quant.ts
git diff -- src/sidecar.ts src/quant.ts UPSTREAM.md NOTICE.md
```

The final two comparisons are read-only. Treat differences in dimensions,
record sizes, CRC coverage, quantization, shard names, locator fields, model
revision, or IndexedDB schema as compatibility-affecting until proven otherwise.

### 7. Safe real-export smoke check

After the human-side export has been generated and Git-synced to the agent vault:

```sh
SEEK_EXPORT_DIR="/path/to/agent/vault/Seek Index" npm start
```

Use an MCP client or PicoClaw to call `index_status` first. Confirm the reported
dimension, format, revision, and chunk count before calling
`semantic_search`. Never test against the human source-of-truth vault when a
read-only agent copy is available.

### 8. Stop conditions

Stop and investigate rather than guessing if any of these occur:

- `SIDECAR_FORMAT` or dimension differs from the compatibility module.
- `MCP Export` metadata and native sidecar metadata disagree.
- A binary record fails CRC validation.
- A locator points outside its shard.
- A document mapping has no native vector or note path.
- Seek's source changed but the upstream compatibility map was not updated.
- A command would write, reindex, commit, push, reset, or mutate the source vault.
