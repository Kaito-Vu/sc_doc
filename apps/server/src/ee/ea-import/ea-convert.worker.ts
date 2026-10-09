/**
 * Worker-thread entry point for converting EA "Model Document" payloads
 * (base64 ZIP -> `str.dat` RTF -> HTML) off the main event loop. One worker is
 * handed a slice of documents and posts one result message per task, followed
 * by a final `{ done: true }`. Pure: no Nest / DB dependencies.
 */
import { parentPort } from 'worker_threads';
import { decodeModelDocument } from './ea-content.builder';
import { EaRtfImage } from './types/ea-import.types';

interface ConvertTask {
  id: string;
  base64: string;
}

interface ConvertJob {
  tasks: ConvertTask[];
  maxDocBytes: number;
}

async function run(job: ConvertJob): Promise<void> {
  for (const task of job.tasks) {
    try {
      const images: EaRtfImage[] = [];
      const html = await decodeModelDocument(
        task.base64,
        {
          maxDocBytes: job.maxDocBytes,
          maxTotalBytes: Number.MAX_SAFE_INTEGER,
          usedTotal: { bytes: 0 },
        },
        images,
      );
      parentPort?.postMessage({ id: task.id, html, images });
    } catch (error) {
      parentPort?.postMessage({
        id: task.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  parentPort?.postMessage({ done: true });
}

parentPort?.on('message', (job: ConvertJob) => {
  void run(job);
});
