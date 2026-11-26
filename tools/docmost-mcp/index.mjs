#!/usr/bin/env node
// Read-only MCP server (stdio) for Docmost: lets Claude Code search/read docs.
// Env: DOCMOST_URL (e.g. https://docs.example.com), DOCMOST_API_KEY (JWT from Settings > API keys).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const { DOCMOST_URL, DOCMOST_API_KEY } = process.env;
if (!DOCMOST_URL || !DOCMOST_API_KEY) {
  console.error('Set DOCMOST_URL and DOCMOST_API_KEY');
  process.exit(1);
}

async function api(path, body = {}) {
  const res = await fetch(`${DOCMOST_URL.replace(/\/$/, '')}/api${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DOCMOST_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${json.message ?? res.statusText}`);
  return json.data ?? json; // server wraps payloads in { data, success, status }
}

const text = (v) => ({
  content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }],
});
const tool = (fn) => async (args) => {
  try {
    return text(await fn(args));
  } catch (e) {
    return { isError: true, ...text(String(e.message ?? e)) };
  }
};

const server = new McpServer({ name: 'docmost', version: '0.1.0' });

server.tool(
  'list_spaces',
  'List the Docmost spaces the API key owner can read.',
  {},
  tool(async () =>
    (await api('/spaces', { limit: 100 })).items.map(({ id, name, slug }) => ({ id, name, slug })),
  ),
);

server.tool(
  'search',
  'Full-text search pages. Optionally restrict to a space. Returns page ids, titles and snippets.',
  { query: z.string(), spaceId: z.string().uuid().optional(), limit: z.number().int().max(50).optional() },
  tool(async ({ query, spaceId, limit }) => api('/search', { query, spaceId, limit: limit ?? 10 })),
);

// All direct children (top-level pages when only spaceId is given), following cursors.
async function children(spaceId, pageId) {
  const out = [];
  let cursor;
  do {
    const r = await api('/pages/sidebar-pages', { spaceId, pageId, limit: 100, cursor });
    out.push(...(r.items ?? []));
    cursor = r.meta?.hasNextPage ? r.meta.nextCursor : undefined;
  } while (cursor);
  return out;
}

const MAX_TREE_PAGES = 2000;

server.tool(
  'list_pages',
  'List direct child pages: top-level pages of a space (spaceId) or children of a page (pageId).',
  { spaceId: z.string().uuid().optional(), pageId: z.string().optional() },
  tool(async ({ spaceId, pageId }) =>
    (await children(spaceId, pageId)).map(({ id, slugId, title, hasChildren }) => ({ id, slugId, title, hasChildren })),
  ),
);

server.tool(
  'get_tree',
  'Outline (titles only) of a whole space (spaceId) or of the subtree under a page (pageId), indented by depth. ' +
    'Use it first to see how documents are organised, then get_page on the ones you need. Ids in [] work with get_page.',
  {
    spaceId: z.string().uuid().optional(),
    pageId: z.string().optional(),
    maxDepth: z.number().int().min(1).max(10).optional().describe('default 6'),
  },
  tool(async ({ spaceId, pageId, maxDepth = 6 }) => {
    if (!spaceId && !pageId) throw new Error('Provide spaceId or pageId');
    const lines = [];
    let count = 0;
    let truncated = false;
    // ponytail: sequential DFS (1 request per branch node); parallelise per level if big spaces feel slow
    const walk = async (sid, pid, depth) => {
      for (const p of await children(sid, pid)) {
        if (++count > MAX_TREE_PAGES) return (truncated = true);
        const more = p.hasChildren && depth + 1 >= maxDepth ? ' …(deeper pages not shown)' : '';
        lines.push(`${'  '.repeat(depth)}- ${p.title || '(untitled)'} [${p.slugId}]${more}`);
        if (p.hasChildren && depth + 1 < maxDepth && (await walk(undefined, p.id, depth + 1))) return true;
      }
    };
    await walk(pageId ? undefined : spaceId, pageId, 0);
    if (truncated) lines.push(`…stopped at ${MAX_TREE_PAGES} pages; call again with a pageId for a narrower subtree`);
    return lines.join('\n') || '(no pages)';
  }),
);

server.tool(
  'get_page',
  'Read a page as Markdown. pageId may be the uuid or the slugId.',
  { pageId: z.string() },
  tool(async ({ pageId }) => {
    const p = await api('/pages/info', { pageId, format: 'markdown' });
    return `# ${p.title}\n\n_id: ${p.id} · space: ${p.space?.name ?? p.spaceId} · updated: ${p.updatedAt}_\n\n${p.content ?? ''}`;
  }),
);

await server.connect(new StdioServerTransport());
