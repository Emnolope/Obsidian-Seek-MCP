This project contains compatibility code derived from Obsidian Seek.

Copyright (c) 2026 Ryan Manor
https://github.com/ryan-manor/Obsidian-Seek

The upstream project is MIT licensed. The copied compatibility modules retain
the upstream algorithms and naming so format updates can be compared directly.
They are intentionally kept as visibly separate, mechanically replaceable
upstream islands inside this repository. Their separation is architectural,
not accidental: MCP code integrates with them through explicit adapters, while
the copied structure remains as close as possible to the original. The target
is the smallest edit distance from Seek, not the fewest copied lines; copying
extra upstream functions is good when it preserves source fidelity and makes
replacement mechanical.

The following files are wholesale vendored snapshots from the pinned Seek
commit `1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd`:

- `vendor/seek/src/model-registry.ts`
- `vendor/seek/src/embedder.ts`
- `vendor/seek/src/iframe-runner.ts`
- `vendor/seek/src/types.ts`

The vendored snapshots retain their upstream attribution and license notices.
`src/query-embedder.ts` is an MCP process adapter around the Seek query path;
`vendor/seek/runtime/transformers.web.js` is the copied Transformers.js web
runtime used to preserve Seek's WASM path. The MCP transport, vault resolver,
loader diagnostics, and document manifest consumer are new project code. The
plugin-side exporter lives in the separate
Seek checkout and currently follows plugin commit
`06b837126f66d54db97ef8785a7c95750e48c311`.

When compatibility code changes, keep upstream-derived code and MCP adapter
code visibly distinct. Preserve upstream naming, layout, ordering, and control
flow; isolate only necessary runtime substitutions; and identify the original
source before updating the port. This minimizes the diff footprint and makes
mechanical copy-and-compare updates safer than locally reimplementing,
compressing, or refactoring the upstream logic.

The porting rule is intentionally broad: copy the largest relevant upstream
file or block first, including helpers that may not be used yet, and adapt
only the imports and platform edges that cannot cross into MCP. Do not reduce
the transplant to a hand-selected rewrite merely to save lines. The goal is a
recognizable wholesale copy whose differences can be found and updated by
comparison with Seek.