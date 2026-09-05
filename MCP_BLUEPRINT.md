# Obsidian Seek MCP Blueprint

## Runtime flow

```text
PicoClaw -> MCP stdio -> semantic_search(queryText | queryVector, filters)
                         -> embed queryText with Seek-compatible Node adapter
                         -> load committed Seek export
                         -> validate generation and dimensions
                         -> cosine-score stored vectors
                         -> resolve chunk -> note
                         -> return ranked context
```

The first implementation accepts a precomputed query vector. Text embedding is
deliberately a separate adapter because the query must use the same model,
revision, preprocessing, normalization, and 384-dimensional output as Seek.

## Pseudocode

```text
server = instantiateMcpServer()
index = loadSeekExport(SEEK_EXPORT_DIR)

server.tool("index_status", () => index.status())
server.tool("semantic_search", ({ queryText, queryVector, topK, pathPrefix }) => {
    queryVector = queryVector ?? seekQueryEmbedder.embed(queryText)
    requireVectorDimension(queryVector, index.dimension)
    hits = []
    for document in index.documents:
        if pathPrefix and not document.notePath.startsWith(pathPrefix): continue
        score = cosine(queryVector, document.vector)
        hits.push({ document, score })
    return sortDescending(hits).take(topK)
})
server.tool("fetch_chunk", ({ chunkId }) => index.chunk(chunkId))
server.tool("fetch_note", ({ notePath }) => {
    requireVaultRelativePath(notePath)
    return index.note(notePath)
})

server.listenOnStdio()
```

## Export contract

Seek publishes one atomic document-mapping generation under `MCP Export/`,
alongside its native sidecar files. Each document record contains the data needed
to explain a vector result; the vector itself remains in Seek's native binary
sidecar, so the MCP process uses the same locator and codec rules as Seek:

```json
{
  "chunkId": "...",
  "notePath": "Projects/example.md",
  "title": "Example",
  "content": "...",
  "chunkIndex": 0,
    "mtime": 0
}
```

The commit marker records `schemaVersion`, `generation`, `modelId`, `revision`,
`chunkerVersion`, `dimension`, and `chunkCount`. It is written last. The MCP
server rejects incomplete exports, duplicate IDs, dimension mismatches, path
traversal, and generation/count inconsistencies.

## Deliberate v1 boundaries

- Read-only MCP tools; no note writes, Git commands, or reindexing.
- Full scan for correctness; candidate generation can use Seek's sign-bit tier later.
- Explicit export after a successful full reindex; no export on every edit.
- Query text and query-vector input are both supported; the local adapter must
    remain aligned with Seek's model, revision, pooling, normalization, and
    output dimension.
- A stale document mapping without a native vector is skipped and reported by
    diagnostics. Malformed records and invalid binary data still fail loading.
- Node uses the CPU execution provider for the query embedder; Seek uses WASM
    in its browser runtime.

## Next plugin-side integration

The Seek plugin should trigger the MCP export only after the semantic indexing
commit has completed successfully, then publish the document mapping and
generation marker atomically with the native sidecar generation. This coupling
must be explicit in the plugin source rather than hidden in shared vector
calculation code.

Use clearly named MCP/export functions and a visibly marked integration block
at the indexing lifecycle boundary. Keep short comments explaining why the
export is coupled there and which files form one generation. This makes the
change easy to locate in a diff parser and easy to review without confusing
MCP plumbing with Seek's embedding algorithm.

## Real-data validation handoff

The export pipeline has now run successfully on the phone and the resulting
`Seek Index` data is available in the agent-side vault copy. The next step is
validation of this blueprint against real data, not further export design.

Start the server with `SEEK_EXPORT_DIR` set to the parent `Seek Index` directory.
Call `index_status` first and verify:

- dimension `384`
- sidecar format `3`
- model ID `tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX`
- revision `54db88c5667bd79b4aea24ea6027a7ef45a7bbb5`
- expected real chunk count, currently known to be `6736`

Then test `fetch_chunk` and `fetch_note`, followed by `semantic_search` using a
real query text and a valid 384-value query vector. Record the diagnostic
counts, whether all exported document IDs resolve to native locators, and
whether CRC validation succeeds across the real shard. Do not infer success
from the existing synthetic unit tests alone.