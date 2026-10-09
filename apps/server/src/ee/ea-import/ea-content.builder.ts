import * as yauzl from 'yauzl';
import * as iconv from 'iconv-lite';
import { rtfToHtml } from './rtf-to-html';
import {
  EaActivity,
  EaPackageNode,
  EaParseWarning,
  EaRtfImage,
} from './types/ea-import.types';

/**
 * Pure content synthesis helpers for the EA import. No Nest / DB
 * dependencies: everything here is deterministic and unit-testable.
 */

export interface DecodeLimits {
  /** Maximum decoded bytes for a single `str.dat` document. */
  maxDocBytes: number;
  /** Maximum decoded bytes across every document in one import. */
  maxTotalBytes: number;
  /** Running total shared across documents (mutated in place). */
  usedTotal: { bytes: number };
}

const PROVENANCE_CALLOUT =
  'Tự động tạo từ sơ đồ Enterprise Architect; nội dung minh họa, không đầy đủ.';

const WIREFRAME_NOTE =
  'Wireframe images are not embedded in the EA export.';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function callout(text: string): string {
  return `<div data-type="callout" data-callout-type="info"><p>${escapeHtml(
    text,
  )}</p></div>`;
}

/**
 * Strip a leading EA code prefix that appears before the first `:`.
 * `GS_01:Theo dõi ...` -> `{ title: 'Theo dõi ...', code: 'GS_01' }`.
 */
export function stripEaCodePrefix(name: string): {
  title: string;
  code: string | null;
} {
  if (typeof name !== 'string' || name.length === 0) {
    return { title: name ?? '', code: null };
  }
  const separator = name.indexOf(':');
  if (separator <= 0) {
    return { title: name, code: null };
  }
  const code = name.slice(0, separator).trim();
  const title = name.slice(separator + 1).trim();
  if (!code || !title) {
    return { title: name, code: null };
  }
  return { title, code };
}

/**
 * Decode a `modeldocument` base64 payload: base64 of a ZIP containing a single
 * `str.dat` RTF document. Decoding is fully in-memory and bounded.
 */
export function decodeModelDocument(
  base64: string,
  limits: DecodeLimits,
  imageSink?: EaRtfImage[],
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    if (typeof base64 !== 'string' || base64.trim().length === 0) {
      reject(new Error('Model document payload is empty'));
      return;
    }

    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) {
      reject(new Error('Model document payload is not valid base64'));
      return;
    }

    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (openError, zipfile) => {
        if (openError || !zipfile) {
          reject(
            new Error(
              `Failed to open model document archive: ${errorMessage(
                openError,
              )}`,
            ),
          );
          return;
        }

        let settled = false;
        const fail = (error: unknown): void => {
          if (settled) {
            return;
          }
          settled = true;
          try {
            zipfile.close();
          } catch {
            // ignore close errors
          }
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        if (zipfile.entryCount !== 1) {
          fail(
            new Error(
              `Model document archive must contain exactly one entry (found ${zipfile.entryCount})`,
            ),
          );
          return;
        }

        zipfile.on('entry', (entry) => {
          const name = entry.fileName;
          if (!(name === 'str.dat' || name.endsWith('/str.dat'))) {
            fail(new Error(`Unexpected model document entry: ${name}`));
            return;
          }
          if (entry.uncompressedSize > limits.maxDocBytes) {
            fail(
              new Error(
                `Model document exceeds the ${limits.maxDocBytes} byte per-document limit`,
              ),
            );
            return;
          }
          if (
            limits.usedTotal.bytes + entry.uncompressedSize >
            limits.maxTotalBytes
          ) {
            fail(
              new Error(
                `Model documents exceed the ${limits.maxTotalBytes} byte total limit`,
              ),
            );
            return;
          }

          zipfile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              fail(
                new Error(
                  `Failed to open model document entry: ${errorMessage(
                    streamError,
                  )}`,
                ),
              );
              return;
            }

            const chunks: Buffer[] = [];
            stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            stream.on('error', (readError) =>
              fail(
                new Error(
                  `Failed to read model document: ${errorMessage(readError)}`,
                ),
              ),
            );
            stream.on('end', () => {
              if (settled) {
                return;
              }
              const raw = Buffer.concat(chunks);
              if (raw.length > limits.maxDocBytes) {
                fail(
                  new Error(
                    `Model document exceeds the ${limits.maxDocBytes} byte per-document limit`,
                  ),
                );
                return;
              }
              limits.usedTotal.bytes += entry.uncompressedSize;
              settled = true;
              try {
                zipfile.close();
              } catch {
                // ignore close errors
              }
              resolve(rtfToHtml(iconv.decode(raw, 'windows-1252'), imageSink));
            });
          });
        });

        zipfile.on('error', (archiveError) =>
          fail(
            new Error(
              `Model document archive error: ${errorMessage(archiveError)}`,
            ),
          ),
        );

        zipfile.readEntry();
      },
    );
  });
}

/**
 * Cheaply read the uncompressed size of a `modeldocument` payload (the single
 * `str.dat` entry) without decompressing it, for budget accounting when
 * documents are converted in parallel. Returns `null` for anything invalid.
 */
export function readModelDocumentUncompressedSize(
  base64: string,
): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    if (typeof base64 !== 'string' || base64.trim().length === 0) {
      resolve(null);
      return;
    }
    const buffer = Buffer.from(base64, 'base64');
    if (buffer.length === 0) {
      resolve(null);
      return;
    }
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zipfile) => {
        if (error || !zipfile) {
          resolve(null);
          return;
        }
        let settled = false;
        const done = (value: number | null): void => {
          if (settled) {
            return;
          }
          settled = true;
          try {
            zipfile.close();
          } catch {
            // ignore close errors
          }
          resolve(value);
        };
        zipfile.on('entry', (entry) => {
          const name = entry.fileName;
          if (name === 'str.dat' || name.endsWith('/str.dat')) {
            done(entry.uncompressedSize);
          } else {
            zipfile.readEntry();
          }
        });
        zipfile.on('error', () => done(null));
        zipfile.on('end', () => done(null));
        zipfile.readEntry();
      },
    );
  });
}

/**
 * Resolve a deterministic, linear order of activities from the
 * `DataAssociation` edges. Unresolved edges are ignored; activities not part
 * of the chain are appended in document order.
 */
function resolveActivityOrder(node: EaPackageNode): EaActivity[] {
  const byId = new Map(node.activities.map((activity) => [activity.id, activity]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  for (const activity of node.activities) {
    incoming.set(activity.id, 0);
  }
  for (const edge of node.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) {
      continue;
    }
    const list = outgoing.get(edge.from) ?? [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }

  const queue = node.activities
    .filter((activity) => (incoming.get(activity.id) ?? 0) === 0)
    .map((activity) => activity.id);
  const visited = new Set<string>();
  const order: EaActivity[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);
    const activity = byId.get(id);
    if (activity) {
      order.push(activity);
    }
    for (const next of outgoing.get(id) ?? []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  for (const activity of node.activities) {
    if (!visited.has(activity.id)) {
      order.push(activity);
    }
  }
  return order;
}

function sanitizeMermaidLabel(label: string): string {
  const cleaned = String(label ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/["`{}\[\]|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'step';
}

function buildLanesTable(node: EaPackageNode): string {
  const byId = new Map(node.activities.map((activity) => [activity.id, activity]));
  let rows = '';
  for (const lane of node.lanes) {
    const members = node.activities.filter((activity) => activity.laneId === lane.id);
    const names = (
      members.length > 0
        ? members.map((activity) => activity.name)
        : lane.activityIds
            .map((id) => byId.get(id)?.name)
            .filter((name): name is string => Boolean(name))
    ).filter((name) => name.length > 0);
    rows += `<tr><td>${escapeHtml(lane.name)}</td><td>${escapeHtml(
      names.join(', '),
    )}</td></tr>`;
  }
  return `<table><thead><tr><th>Lane</th><th>Steps</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Synthesized flow HTML: provenance callout, lanes table (when present), an
 * ordered step list, and a Mermaid block only when every edge resolves.
 */
export function buildFlowHtml(
  node: EaPackageNode,
  imageHtmlById?: Map<string, string>,
): string {
  const byId = new Map(node.activities.map((activity) => [activity.id, activity]));
  let html = callout(PROVENANCE_CALLOUT);
  html += `<h2>${escapeHtml(node.name)}</h2>`;

  if (node.lanes.length > 0) {
    html += buildLanesTable(node);
  }

  const ordered = resolveActivityOrder(node);
  if (ordered.length > 0) {
    html += `<ol>${ordered
      .map((activity) => `<li>${escapeHtml(activity.name)}</li>`)
      .join('')}</ol>`;
  }

  const allEdgesResolve =
    node.edges.length > 0 &&
    node.edges.every((edge) => byId.has(edge.from) && byId.has(edge.to));
  if (allEdgesResolve) {
    const index = new Map(ordered.map((activity, position) => [activity.id, position]));
    const lines = ['flowchart LR'];
    for (const activity of ordered) {
      lines.push(
        `  n${index.get(activity.id)}["${sanitizeMermaidLabel(activity.name)}"]`,
      );
    }
    for (const edge of node.edges) {
      lines.push(`  n${index.get(edge.from)} --> n${index.get(edge.to)}`);
    }
    html += `<pre><code class="language-mermaid">${escapeHtml(
      lines.join('\n'),
    )}</code></pre>`;
  }

  if (imageHtmlById) {
    for (const diagram of node.diagrams) {
      const image = imageHtmlById.get(diagram.diagramId ?? diagram.name);
      if (image) {
        html += image;
      }
    }
  }

  return html;
}

/**
 * Synthesized diagram HTML: provenance callout, a heading and the diagram
 * names, plus the wireframe limitation callout.
 */
export function buildDiagramHtml(
  node: EaPackageNode,
  imageHtmlById?: Map<string, string>,
): string {
  let html = callout(PROVENANCE_CALLOUT);
  html += `<h2>${escapeHtml(node.name)}</h2>`;
  let missingImage = false;
  for (const diagram of node.diagrams) {
    const image = imageHtmlById?.get(diagram.diagramId ?? diagram.name);
    html += `<p><strong>${escapeHtml(diagram.name)}</strong></p>`;
    if (image) {
      html += image;
    } else {
      missingImage = true;
    }
  }
  if (missingImage) {
    html += callout(WIREFRAME_NOTE);
  }
  return html;
}

/**
 * Container page content: the original EA name as a caption when a code prefix
 * was stripped, plus a short child summary.
 */
export function buildContainerHtml(
  node: EaPackageNode,
  code: string | null,
): string {
  let html = '';
  if (code) {
    html += `<p><em>${escapeHtml(node.name)}</em></p>`;
  }

  const children = node.children;
  if (children.length > 0) {
    html += `<p>${escapeHtml(
      String(children.length),
    )} sub-sections:</p><ul>${children
      .map((child) => `<li>${escapeHtml(child.name)}</li>`)
      .join('')}</ul>`;
  } else {
    html += '<p></p>';
  }
  return html;
}

/**
 * Concatenate every RTF document attached to a package, in order. A failed
 * document yields a warning and an empty paragraph rather than aborting.
 */
export async function buildDocumentsHtml(
  node: EaPackageNode,
  limits: DecodeLimits,
  imageSink?: EaRtfImage[],
): Promise<{ html: string; warnings: EaParseWarning[] }> {
  let html = '';
  const warnings: EaParseWarning[] = [];
  for (const document of node.documents) {
    try {
      html += await decodeModelDocument(document.base64, limits, imageSink);
    } catch (error) {
      warnings.push({
        page: document.ownerName || node.name,
        reason: errorMessage(error),
      });
      html += '<p></p>';
    }
  }
  return { html, warnings };
}

function headingText(node: any): string {
  if (!node || node.type !== 'heading') {
    return '';
  }
  return (node.content ?? [])
    .map((child: any) => (child && typeof child.text === 'string' ? child.text : ''))
    .join('');
}

function normalizeHeading(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Remove a leading heading that duplicates the page title (the RTF body often
 * repeats it), and guarantee the document has at least one block.
 */
export function stripDuplicateLeadingHeading(json: any, title: string): any {
  if (!json || !Array.isArray(json.content)) {
    return json;
  }
  const content = json.content;
  const first = content[0];
  if (
    first &&
    first.type === 'heading' &&
    typeof title === 'string' &&
    title.length > 0
  ) {
    const text = headingText(first);
    if (text && normalizeHeading(text) === normalizeHeading(title)) {
      content.shift();
    }
  }
  if (content.length === 0) {
    content.push({ type: 'paragraph', content: [] });
  }
  return json;
}
