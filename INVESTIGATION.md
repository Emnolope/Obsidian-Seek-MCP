# Seek/MCP Technical Investigation

Last verified: 2026-09-06

This file records verified implementation facts. The rationale belongs in
`CONTEXT.md`; ordered work belongs in `TODO.md`.

## Repository versions

- MCP repository: `/workspaces/Obsidian-Seek-MCP`
- MCP commit/release: `4b53ec3` / `Obsidian-Vault-MCP-v4`
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
pinned model and Node CPU execution.

The working tree also contains a read-only CLI that uses the same vault
resolver, index loader, and query embedder as the MCP server. There is no
official MCP SDK dependency; transport is a small hand-written stdio loop.

## Validation baseline

The MCP repository's current checks are:

```sh
npm run build
npm test
git diff --check
```

The committed tests cover CRC-protected fixture loading, cosine ranking, and
note path traversal rejection. Hidden/visible resolver behavior and full MCP
protocol behavior still need tests.
