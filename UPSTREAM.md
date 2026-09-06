# Upstream Compatibility Map

The compatibility layer follows Obsidian Seek commit
`1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd`. The currently inspected plugin
checkout is newer (`06b837126f66d54db97ef8785a7c95750e48c311`), so a future
compatibility review must compare those revisions before changing format code.

| Seek source | MCP counterpart | Relationship |
| --- | --- | --- |
| `src/quant.ts` | `src/quant.ts` | Same quantized vector representation and dequantization rules, adapted for Node. |
| `src/sidecar.ts` constants and codec | `src/sidecar.ts` | Same format-3 dimensions, record layout, CRC, and offset rules. |
| `src/sidecar.ts` locator scanning | `src/sidecar.ts` | Same winner ordering, adapted from Obsidian/DataAdapter reads to Node filesystem reads. |
| `src/sidecar.ts` record reads | `src/sidecar.ts` | Same shard naming and range validation, adapted to Node buffers. |
| `src/model-registry.ts` | `vendor/seek/src/model-registry.ts` | Vendored snapshot at the pinned compatibility commit. |
| `src/embedder.ts` | `vendor/seek/src/embedder.ts` | Vendored snapshot at the pinned compatibility commit. |
| `src/iframe-runner.ts` | `vendor/seek/src/iframe-runner.ts` | Vendored snapshot containing Seek's browser embedding path. |
| `src/types.ts` | `vendor/seek/src/types.ts` | Vendored dependency snapshot for embedding compatibility. |
| `src/index-store.ts` read APIs | `/workspaces/Obsidian-Seek/src/mcp-export.ts` | Plugin-side exporter that joins document data to chunk IDs. |

The MCP transport, vault-location resolver, document manifest contract, loader
diagnostics, and query runtime adapter are new boundary code. They are not
upstream Seek files.

`src/query-embedder.ts` follows Seek's query preprocessing, pooling,
normalization, model, revision, token limit, and output dimension, but replaces
the browser iframe/WASM runtime with Node CPU execution.

## Maintenance procedure

Before every Seek update, compare the pinned compatibility source with the new
Seek source, especially `quant.ts`, `sidecar.ts`, `binary.ts`, model metadata,
types, and IndexedDB read/schema APIs. Port format-sensitive changes without
guessing unknown formats, update fixtures and version gates, and rerun MCP
build/tests plus hidden and visible export validation.
