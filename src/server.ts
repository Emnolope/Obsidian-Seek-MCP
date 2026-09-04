import { createInterface } from 'node:readline';
import { SeekIndex } from './index.ts';
import { SeekQueryEmbedder } from './query-embedder.ts';

const root = process.env.SEEK_EXPORT_DIR ?? process.argv[2] ?? './Seek Index';
const index = await SeekIndex.load(root);
const queryEmbedder = new SeekQueryEmbedder();

function result(value: unknown) { return { content: [{ type: 'text', text: JSON.stringify(value) }] }; }
function error(message: string) { return { isError: true, content: [{ type: 'text', text: message }] }; }

async function handle(message: any): Promise<any> {
  if (message.method === 'initialize') return { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'obsidian-seek-mcp', version: '1.0.0' } };
  if (message.method === 'notifications/initialized') return undefined;
  if (message.method === 'tools/list') return { tools: [
    { name: 'index_status', description: 'Return Seek export metadata and load status.', inputSchema: { type: 'object', properties: {} } },
    { name: 'semantic_search', description: 'Rank Seek chunks by cosine similarity to query text or a precomputed query vector.', inputSchema: { type: 'object', properties: { queryText: { type: 'string' }, queryVector: { type: 'array', items: { type: 'number' } }, topK: { type: 'integer', minimum: 1, maximum: 100 }, pathPrefix: { type: 'string' } } } },
    { name: 'fetch_chunk', description: 'Fetch one indexed chunk by ID.', inputSchema: { type: 'object', required: ['chunkId'], properties: { chunkId: { type: 'string' } } } },
    { name: 'fetch_note', description: 'Fetch all indexed chunks for a vault-relative note path.', inputSchema: { type: 'object', required: ['notePath'], properties: { notePath: { type: 'string' } } } },
  ] };
  if (message.method !== 'tools/call') return message.id === undefined ? undefined : { error: { code: -32601, message: 'method not found' }, id: message.id };
  try {
    const args = message.params?.arguments ?? {};
    const value = message.params.name === 'index_status' ? index.status()
      : message.params.name === 'semantic_search' ? index.search(
        args.queryVector ?? Array.from(await queryEmbedder.embed(args.queryText)),
        args.topK,
        args.pathPrefix,
      )
      : message.params.name === 'fetch_chunk' ? index.chunk(args.chunkId)
      : message.params.name === 'fetch_note' ? index.note(args.notePath)
      : (() => { throw new Error(`unknown tool: ${message.params.name}`); })();
    return { jsonrpc: '2.0', id: message.id, result: result(value) };
  } catch (e) { return { jsonrpc: '2.0', id: message.id, result: error(e instanceof Error ? e.message : String(e)) }; }
}

const input = createInterface({ input: process.stdin });
for await (const line of input) {
  if (!line.trim()) continue;
  const response = await handle(JSON.parse(line));
  if (response) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...response })}\n`);
}