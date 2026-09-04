# Obsidian Seek MCP Blueprint

## Runtime flow

```text
PicoClaw -> MCP stdio -> semantic_search(queryVector, filters)
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
server.tool("semantic_search", ({ queryVector, topK, pathPrefix }) => {
    requireVectorDimension(queryVector, index.dimension)
    hits = []
    for document in index.documents:
        if pathPrefix and not document.notePath.startsWith(pathPrefix): continue
        score = cosine(queryVector, document.vector)
        hits.push({ document, score })
    return groupChunksByNote(sortDescending(hits).take(topK))
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
- Query-vector input first; a matching local embedding adapter follows separately.