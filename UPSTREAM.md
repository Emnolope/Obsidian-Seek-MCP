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
| `src/model-registry.ts` | `vendor/seek/src/model-registry.ts` | Wholesale vendored snapshot; byte-identical at the pinned commit. Defines the default model, revision, dimension, dtype, and registry helpers. |
| `src/embedder.ts` | `vendor/seek/src/embedder.ts` | Wholesale vendored snapshot; byte-identical at the pinned commit. Defines the local embedder and query `embed(text)` entry point. |
| `src/iframe-runner.ts` | `vendor/seek/src/iframe-runner.ts` | Wholesale vendored snapshot; byte-identical at the pinned commit. Contains the tokenizer, transformers.js, model loading, and iframe RPC implementation. |
| `src/types.ts` | `vendor/seek/src/types.ts` | Wholesale vendored dependency snapshot for the embedding files; byte-identical at the pinned commit. |

The MCP transport, tool handlers, and document manifest are intentionally new.
They have no upstream equivalent and should not be mistaken for copied Seek
code. When updating Seek, compare the pinned commit against the new Seek source
first, then update the rows above and the corresponding compatibility modules.

The compatibility modules are not byte-for-byte copies: imports and filesystem
adapters necessarily differ. The protocol-critical algorithms and names are
kept close so upstream diffs remain localized and reviewable.

The four files under `vendor/seek/src/` are intentionally different: they are
wholesale snapshots of the corresponding Seek source files. They are retained
outside the MCP runtime while the Node adapter is built, so a future upstream
comparison can show additions and removals directly instead of comparing a
refactored approximation.

`src/query-embedder.ts` is new boundary code. It follows Seek's
`iframe-runner.ts` query path and uses the same model registry values, while
replacing the browser iframe with the Node Transformers.js runtime. Its
`sliceAndRenormalize` helper is intentionally copied from Seek; the only
intentional runtime difference is fixed `wasm` execution with the query path's
128-token cap.

## Current integration status

The pinned compatibility source remains Seek commit
`1f0a9b0ce3854f82cc746e02f9cd27bcdbc30acd`. The modified Seek plugin was built
and released as `1.1.3-mcp-export-v2`, installed through BRAT, and used to
produce the real MCP export. No upstream compatibility update is pending for
the immediate handoff.

The existing implementation has been validated against the supplied real
export: the 384 dimension, format 3 record layout, model revision, binary
offsets, and all 6,736 CRC checks pass. The export still has 6 skipped document
mappings and 7 orphan native locators. The next work is plugin-side generation
coupling and lifecycle integration, not compatibility-code discovery. The
revoked setup PAT is unrelated to upstream compatibility and must not be added
to this document.

The critical rule for the plugin-side integration is that the MCP export is not a
second state machine. It is a visible extension of Seek's real successful commit
path. The native vector sidecar, chunk metadata, and document mapping are already
paired by the upstream atomic commit; the MCP export must be attached to that
same boundary. This preserves the single source of truth, keeps the integration
auditable in a diff, and avoids inventing a separate generation protocol that
can drift from the real index.

The Node query adapter and fuzzy-loader diagnostics are MCP-specific additions;
they are not changes to the vendored Seek snapshots or to Seek's strict export
writer. Before a future Seek update, compare both the embedding/query path and
the sidecar/export formats against the pinned commit.

For the next plugin integration, preserve that boundary in the Seek checkout:
keep MCP/export code in clearly named, visibly marked blocks and keep the
indexing lifecycle hook separate from model, tokenizer, pooling, and
quantization code. This is a maintenance requirement so source diffs reveal
the coupling and its format-sensitive consequences immediately.