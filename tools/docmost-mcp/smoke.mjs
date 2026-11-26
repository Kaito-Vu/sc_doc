// Smoke test against a real Docmost, through the MCP server itself.
// Usage: set DOCMOST_URL and DOCMOST_API_KEY, then `node smoke.mjs`.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const client = new Client({ name: 'smoke', version: '0' });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./index.mjs', import.meta.url))],
    env: { ...process.env },
  }),
);

async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content[0].text;
  if (r.isError) throw new Error(`${name}: ${text}`);
  return text;
}
const head = (s, n) => (s.length > n ? s.slice(0, n) + `… (+${s.length - n} chars)` : s);

try {
  const spaces = JSON.parse(await call('list_spaces'));
  console.log(`list_spaces: ${spaces.length} space(s):`, spaces.map((s) => s.name).join(', '));

  const tree = await call('get_tree', { spaceId: spaces[0].id, maxDepth: 3 });
  console.log(`\nget_tree "${spaces[0].name}" (${tree.split('\n').length} lines):\n${tree.split('\n').slice(0, 25).join('\n')}`);

  const slug = tree.match(/\[(\w+)\]/)?.[1];
  const page = await call('get_page', { pageId: slug });
  console.log(`\nget_page ${slug}:\n${head(page, 500)}`);

  const word = page.match(/^# (\S+)/)?.[1];
  console.log(`\nsearch "${word}":\n${head(await call('search', { query: word, limit: 3 }), 600)}`);
  console.log('\nALL OK');
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await client.close();
}
