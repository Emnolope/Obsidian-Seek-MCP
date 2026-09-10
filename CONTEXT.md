# Obsidian Seek MCP Context

## Why this exists

This project gives an agent useful access to a human-maintained Obsidian vault
without turning the agent into another author of that vault. Seek remains the
human-side indexing and embedding authority; this repository is the read-side
bridge that makes the already-created knowledge searchable by PicoClaw.

The separation is intentional. A human's notes and the agent's retrieval
process have different responsibilities and different failure modes. The agent
copy should be safe to inspect, synchronize, rebuild, and debug without
silently editing the human source of truth or inventing a second embedding
space. Compatibility, read-only behavior, and explicit unfinished work matter
more here than making the repository look complete.

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
The compatibility contract is specified by `src/SEEK-COMPATIBILITY.md` and
realized by `src/seek-compatibility.ts`; both should be updated together when
Seek changes.

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

The current MCP repository is published as `Obsidian-Vault-MCP-v4`. The plugin
checkout is commit `06b837126f66d54db97ef8785a7c95750e48c311`.

The available real system-vault data currently shows:

- visible native locator records: 6,736
- visible MCP document records: 6,735
- hidden native locator records: 6
- model ID: `tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX`
- revision: `54db88c5667bd79b4aea24ea6027a7ef45a7bbb5`
- dimension: `384`
- sidecar format: `3`

The 6,735/6,736 mismatch is real and remains a diagnostic/recovery case, not
evidence of a complete export. A fresh export after fixing the location
coupling must be validated end to end.

The current loader run against the phone's synchronized agent vault loaded
6,729 of 6,735 document records, skipped 6 stale mappings, and found 7 orphan
native vectors. Search remains usable, but this is not a complete consistency
result.

## Scope boundaries

The current server supports natural-language query embedding with the pinned
Seek-compatible model, or a caller-supplied 384-value query vector. Search is a
full scan and returns chunk-level hits. A read-only CLI now uses the same vault
loader and index APIs for status, search, chunk, and note checks. Note-level
grouping, response bounds, automatic reload, and tombstone handling are not
implemented yet. The query backend defaults to WASM; `SEEK_MCP_DEVICE=auto` may
attempt WebGPU and fall back to WASM, while `SEEK_MCP_DEVICE=webgpu` is strict
and fails when WebGPU cannot initialize. The phone's actual WebGPU capability
has now been tested from Termux. The phone is Android arm64 with Node 26,
seven reported CPUs, SharedArrayBuffer, and Atomics, but Node exposes neither
`navigator.gpu` nor a global `GPU`. The published `webgpu` package installs but
fails because it has no `android-arm64/dawn.node` binary. The official
`onnxruntime-node` package rejects Android at install time.

The phone-side tests also corrected the declared `onnxruntime-common` version
and installed it successfully. The real Seek-compatible web/WASM embedder still
failed because the browser-oriented runtime produced a `blob:` module URL that
Node's ESM loader does not support. The experimental Chromium sidecar now
supplies the browser environment expected by the copied web stack, and its
launch and browser embedding path were reached on the OnePlus 6T. The final
384-value CDP payload was not available for this handoff, so valid phone
embedding and throughput remain unverified. A custom Android native build is
not yet justified by evidence.
