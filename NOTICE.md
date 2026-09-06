This project contains compatibility code derived from Obsidian Seek.

Copyright (c) 2026 Ryan Manor
https://github.com/ryan-manor/Obsidian-Seek

The upstream project is MIT licensed. The copied compatibility modules retain
the upstream algorithms and naming so format updates can be compared directly.

The following files are wholesale vendored snapshots from the pinned Seek
commit `1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd`:

- `vendor/seek/src/model-registry.ts`
- `vendor/seek/src/embedder.ts`
- `vendor/seek/src/iframe-runner.ts`
- `vendor/seek/src/types.ts`

The vendored snapshots retain their upstream attribution and license notices.
`src/query-embedder.ts` is a Node runtime adapter around the Seek query path;
the MCP transport, vault resolver, loader diagnostics, and document manifest
consumer are new project code. The plugin-side exporter lives in the separate
Seek checkout and currently follows plugin commit
`06b837126f66d54db97ef8785a7c95750e48c311`.