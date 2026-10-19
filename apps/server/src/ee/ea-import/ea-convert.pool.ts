import { readModelDocumentUncompressedSize } from './ea-content.builder';
import { runEaCpuJobs } from './ea-cpu.pool';
import { shiftEaRtfImagePlaceholders } from './rtf-to-html';
import {
  EaPackageNode,
  EaParseWarning,
  EaRtfImage,
} from './types/ea-import.types';

export { eaConvertConcurrency } from './ea-cpu.pool';

/**
 * Convert EA "Model Document" payloads (base64 ZIP -> RTF -> HTML) on the
 * shared EA worker-thread pool (`ea-cpu.pool.ts`), falling back to in-process
 * conversion when workers are unavailable (tests, unbundled dev runs).
 */

export interface EaConvertTask {
  id: string;
  base64: string;
}

export interface EaConvertResult {
  html?: string;
  images?: EaRtfImage[];
  error?: string;
}

const MAX_TOTAL_RTF_BYTES = 96 * 1024 * 1024;
const MAX_SINGLE_DOC_BYTES = 32 * 1024 * 1024;

export async function convertModelDocuments(
  tasks: EaConvertTask[],
  maxDocBytes: number,
): Promise<Map<string, EaConvertResult>> {
  const results = new Map<string, EaConvertResult>();
  if (tasks.length === 0) {
    return results;
  }
  const converted = await runEaCpuJobs(
    tasks.map((task) => ({
      kind: 'doc' as const,
      id: task.id,
      base64: task.base64,
      maxDocBytes,
    })),
    undefined,
    { forceWorkers: true },
  );
  for (const [id, result] of converted) {
    results.set(id, {
      html: result.html,
      images: result.images,
      error: result.error,
    });
  }
  return results;
}

/**
 * Convert every page's Model Documents ahead of the page loop. Documents are
 * independent and CPU-bound, so they run across the worker pool; the
 * per-document and total byte budgets are enforced up-front via a cheap size
 * pre-scan (workers run without a shared budget). A failed or over-budget
 * document becomes a warning plus an empty paragraph.
 */
export async function convertNodeDocuments(
  nodes: EaPackageNode[],
  warnings: EaParseWarning[],
): Promise<Map<EaPackageNode, { html: string; images: EaRtfImage[] }>> {
  const result = new Map<
    EaPackageNode,
    { html: string; images: EaRtfImage[] }
  >();
  const nodesWithDocuments = nodes.filter((node) => node.documents.length > 0);
  if (nodesWithDocuments.length === 0) {
    return result;
  }

  interface DocEntry {
    id?: string;
    skipReason?: string;
    warningPage: string;
  }
  const entriesByNode = new Map<EaPackageNode, DocEntry[]>();
  const tasks: EaConvertTask[] = [];
  let totalBytes = 0;

  for (const node of nodesWithDocuments) {
    const entries: DocEntry[] = [];
    for (const document of node.documents) {
      const warningPage = document.ownerName || node.name;
      const size = await readModelDocumentUncompressedSize(document.base64);
      if (size !== null && size > MAX_SINGLE_DOC_BYTES) {
        entries.push({
          skipReason: `Model document exceeds the ${MAX_SINGLE_DOC_BYTES} byte per-document limit`,
          warningPage,
        });
        continue;
      }
      if (size !== null && totalBytes + size > MAX_TOTAL_RTF_BYTES) {
        entries.push({
          skipReason: `Model documents exceed the ${MAX_TOTAL_RTF_BYTES} byte total limit`,
          warningPage,
        });
        continue;
      }
      totalBytes += size ?? 0;
      const id = `doc-${tasks.length}`;
      entries.push({ id, warningPage });
      tasks.push({ id, base64: document.base64 });
    }
    entriesByNode.set(node, entries);
  }

  const converted = await convertModelDocuments(tasks, MAX_SINGLE_DOC_BYTES);

  for (const node of nodesWithDocuments) {
    let html = '';
    const images: EaRtfImage[] = [];
    for (const entry of entriesByNode.get(node) ?? []) {
      const doc = entry.id ? converted.get(entry.id) : undefined;
      if (!entry.skipReason && doc && !doc.error && typeof doc.html === 'string') {
        // Each document numbers its image placeholders from 0; renumber so
        // they index into this page's combined image list.
        html += shiftEaRtfImagePlaceholders(doc.html, images.length);
        images.push(...(doc.images ?? []));
        continue;
      }
      warnings.push({
        page: entry.warningPage,
        reason:
          entry.skipReason ?? doc?.error ?? 'Failed to convert model document',
      });
      html += '<p></p>';
    }
    result.set(node, { html, images });
  }

  return result;
}
