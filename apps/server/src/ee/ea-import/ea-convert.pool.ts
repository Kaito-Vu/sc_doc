import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { decodeModelDocument } from './ea-content.builder';
import { EaRtfImage } from './types/ea-import.types';

/**
 * Convert EA "Model Document" payloads in parallel across worker threads,
 * falling back to in-process conversion when workers are unavailable (tests,
 * unbundled dev runs) or fail. The heavy RTF/base64/deflate work is CPU-bound
 * and independent per document, so this scales with available cores.
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

/** Compiled worker next to this module (`dist/ee/ea-import/...`). */
const WORKER_FILE = path.join(__dirname, 'ea-convert.worker.js');

/** Upper bound on worker threads (overridable via env). */
export function eaConvertConcurrency(): number {
  const parsed = parseInt(
    process.env.EA_IMPORT_CONVERT_CONCURRENCY ?? '',
    10,
  );
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  try {
    const cores =
      typeof os.availableParallelism === 'function'
        ? os.availableParallelism()
        : os.cpus().length;
    return Math.max(1, Math.min(4, cores - 1));
  } catch {
    return 1;
  }
}

export async function convertModelDocuments(
  tasks: EaConvertTask[],
  maxDocBytes: number,
): Promise<Map<string, EaConvertResult>> {
  const results = new Map<string, EaConvertResult>();
  if (tasks.length === 0) {
    return results;
  }

  const concurrency = Math.min(eaConvertConcurrency(), tasks.length);
  if (concurrency <= 1 || !fs.existsSync(WORKER_FILE)) {
    for (const task of tasks) {
      results.set(task.id, await convertInline(task, maxDocBytes));
    }
    return results;
  }

  // Round-robin so each worker gets a mix of (varied-size) documents.
  const chunks: EaConvertTask[][] = Array.from(
    { length: concurrency },
    () => [],
  );
  tasks.forEach((task, index) => chunks[index % concurrency].push(task));

  await Promise.all(
    chunks.map(async (chunk) => {
      if (chunk.length === 0) {
        return;
      }
      try {
        const chunkResults = await runWorkerChunk(chunk, maxDocBytes);
        for (const [id, result] of chunkResults) {
          results.set(id, result);
        }
      } catch {
        for (const task of chunk) {
          if (!results.has(task.id)) {
            results.set(task.id, await convertInline(task, maxDocBytes));
          }
        }
      }
    }),
  );

  return results;
}

async function convertInline(
  task: EaConvertTask,
  maxDocBytes: number,
): Promise<EaConvertResult> {
  try {
    const images: EaRtfImage[] = [];
    const html = await decodeModelDocument(
      task.base64,
      {
        maxDocBytes,
        maxTotalBytes: Number.MAX_SAFE_INTEGER,
        usedTotal: { bytes: 0 },
      },
      images,
    );
    return { html, images };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function runWorkerChunk(
  chunk: EaConvertTask[],
  maxDocBytes: number,
): Promise<Map<string, EaConvertResult>> {
  return new Promise<Map<string, EaConvertResult>>((resolve, reject) => {
    const worker = new Worker(WORKER_FILE);
    const results = new Map<string, EaConvertResult>();
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      void worker.terminate().catch(() => undefined);
      if (error) {
        reject(error);
      } else {
        resolve(results);
      }
    };

    worker.on('message', (message: any) => {
      if (message?.done) {
        finish();
        return;
      }
      if (message && message.id !== undefined) {
        const images = Array.isArray(message.images)
          ? (message.images as Array<{ mimeType: string; buffer: any }>).map(
              (image) => ({
                mimeType: image.mimeType,
                buffer: Buffer.from(image.buffer),
              }),
            )
          : undefined;
        results.set(String(message.id), {
          html: message.html,
          images,
          error: message.error,
        });
      }
    });
    worker.on('error', (error) =>
      finish(error instanceof Error ? error : new Error(String(error))),
    );
    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        finish(new Error(`EA convert worker exited with code ${code}`));
      }
    });

    worker.postMessage({ tasks: chunk, maxDocBytes });
  });
}
