/**
 * Pure CPU-bound EA import steps, runnable either in a worker thread
 * (`ea-cpu.worker.ts`) or inline (tests / unbundled dev). No Nest / DB use.
 */
import { load } from 'cheerio';
import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import {
  htmlToJson,
  tiptapExtensions,
} from '../../collaboration/collaboration.util';
import { normalizeImportHtml } from '../../integrations/import/utils/import-formatter';
import { isBpmnDocument, parseEaBpmn } from './ea-bpmn.parser';
import { stripDuplicateLeadingHeading } from './ea-content.builder';
import { isEaNativeDocument, parseEaNative } from './ea-native.parser';
import { parseEaXmi } from './ea-xmi.parser';
import { isXmi21Document, parseEaXmi21 } from './ea-xmi21.parser';
import { EaParseResult } from './types/ea-import.types';

export type EaCpuJob =
  | { kind: 'parse'; id: string; buffer: Uint8Array }
  | { kind: 'page'; id: string; html: string; title: string };

export interface EaCpuResult {
  id: string;
  error?: string;
  parsed?: EaParseResult;
  content?: any;
  ydoc?: Uint8Array | null;
}

const EMPTY_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [] }],
};

function toYdoc(content: any): Uint8Array {
  const ydoc = TiptapTransformer.toYdoc(content, 'default', tiptapExtensions);
  return Y.encodeStateAsUpdate(ydoc);
}

export function parseEaBuffer(input: Uint8Array): EaParseResult {
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (isEaNativeDocument(buffer)) {
    return parseEaNative(buffer);
  }
  if (isXmi21Document(buffer)) {
    return parseEaXmi21(buffer);
  }
  return isBpmnDocument(buffer) ? parseEaBpmn(buffer) : parseEaXmi(buffer);
}

export function runEaCpuJob(job: EaCpuJob): EaCpuResult {
  try {
    if (job.kind === 'parse') {
      return { id: job.id, parsed: parseEaBuffer(job.buffer) };
    }
    try {
      const $ = load(job.html);
      normalizeImportHtml($, $.root());
      const content = stripDuplicateLeadingHeading(
        htmlToJson($.html() || ''),
        job.title,
      );
      return { id: job.id, content, ydoc: toYdoc(content) };
    } catch (error) {
      // Same degradation as before: keep the page, with an empty body.
      let ydoc: Uint8Array | null = null;
      try {
        ydoc = toYdoc(EMPTY_DOC);
      } catch {
        ydoc = null;
      }
      return {
        id: job.id,
        content: EMPTY_DOC,
        ydoc,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  } catch (error) {
    return {
      id: job.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
