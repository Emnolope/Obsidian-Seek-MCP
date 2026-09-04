# Upstream Compatibility Map

The compatibility layer follows Obsidian Seek commit
`1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd`.

| Seek source | MCP counterpart | Relationship |
| --- | --- | --- |
| `src/quant.ts` | `src/quant.ts` | Same `QuantVec`, quantization, and dequantization algorithm; attribution header retained. |
| `src/sidecar.ts` constants and codec | `src/sidecar.ts` | Same dimension, record layout, CRC32, `encodeRecord`, `decodeRecord`, and offset rules. |
| `src/sidecar.ts` `scanJsonl` | `src/sidecar.ts` | Same per-device and cross-device winner ordering, adapted from `DataAdapter` to Node filesystem reads. |
| `src/sidecar.ts` `readRecordAt` | `src/sidecar.ts` | Same shard naming, range validation, and codec call, adapted to Node buffers. |
| `src/index-store.ts` read methods | `Obsidian-Seek/src/mcp-export.ts` | New bridge code; joins Seek stores and exports the missing document mapping. |

The MCP transport, tool handlers, and document manifest are intentionally new.
They have no upstream equivalent and should not be mistaken for copied Seek
code. When updating Seek, compare the pinned commit against the new Seek source
first, then update the rows above and the corresponding compatibility modules.

The compatibility modules are not byte-for-byte copies: imports and filesystem
adapters necessarily differ. The protocol-critical algorithms and names are
kept close so upstream diffs remain localized and reviewable.