import * as fs from 'fs';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { eaConvertConcurrency } from './ea-convert.pool';
import { EaCpuJob, EaCpuResult, runEaCpuJob } from './ea-cpu.tasks';

/** Compiled worker next to this module (`dist/ee/ea-import/...`). */
const WORKER_FILE = path.join(__dirname, 'ea-cpu.worker.js');

/** Below this many jobs a worker's startup cost outweighs the parallelism. */
const MIN_JOBS_FOR_WORKERS = 6;

function rehydrate<T>(value: T): T {
  if (value instanceof Uint8Array && !Buffer.isBuffer(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength) as any;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => (value[i] = rehydrate(item)));
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      (value as any)[key] = rehydrate((value as any)[key]);
    }
  }
  return value;
}

function runChunk(
  jobs: EaCpuJob[],
  onResult: (result: EaCpuResult) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(WORKER_FILE);
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      void worker.terminate().catch(() => undefined);
      error ? reject(error) : resolve();
    };
    worker.on('message', (message: any) => {
      if (message?.done) return finish();
      onResult(rehydrate(message));
    });
    worker.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
    worker.on('exit', (code) => {
      if (!settled && code !== 0) {
        finish(new Error(`EA cpu worker exited with code ${code}`));
      }
    });
    worker.postMessage(jobs);
  });
}

/**
 * Run CPU-bound jobs across worker threads (round-robin), falling back to
 * inline execution for few jobs, missing worker file or a worker failure.
 * `onResult` fires per finished job (progress / cancellation hook); it may
 * throw to abort the whole run.
 */
export async function runEaCpuJobs(
  jobs: EaCpuJob[],
  onResult?: (result: EaCpuResult) => void | Promise<void>,
  opts: { forceWorkers?: boolean } = {},
): Promise<Map<string, EaCpuResult>> {
  const results = new Map<string, EaCpuResult>();
  const record = async (result: EaCpuResult): Promise<void> => {
    results.set(result.id, result);
    await onResult?.(result);
  };
  const runInline = async (list: EaCpuJob[]): Promise<void> => {
    for (const job of list) {
      if (!results.has(job.id)) {
        await record(runEaCpuJob(job));
        // let the event loop breathe between jobs
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  };

  const concurrency = Math.min(eaConvertConcurrency(), jobs.length);
  if (
    (jobs.length < MIN_JOBS_FOR_WORKERS && !opts.forceWorkers) ||
    concurrency < 1 ||
    (concurrency === 1 && !opts.forceWorkers) ||
    !fs.existsSync(WORKER_FILE)
  ) {
    await runInline(jobs);
    return results;
  }

  const chunks: EaCpuJob[][] = Array.from({ length: concurrency }, () => []);
  jobs.forEach((job, i) => chunks[i % concurrency].push(job));

  // Results are buffered then replayed on this async chain so `onResult` can
  // await (and throw) without racing worker message events.
  const pending: EaCpuResult[] = [];
  let chain: Promise<void> = Promise.resolve();
  let abort: unknown;
  const enqueue = (result: EaCpuResult): void => {
    pending.push(result);
    chain = chain.then(async () => {
      const next = pending.shift()!;
      if (abort === undefined) {
        try {
          await record(next);
        } catch (e) {
          abort = e ?? new Error('aborted');
        }
      }
    });
  };

  await Promise.all(
    chunks
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => runChunk(chunk, enqueue).catch(() => undefined)),
  );
  await chain;
  if (abort !== undefined) throw abort;
  // A failed worker leaves its jobs unfinished: do those here.
  await runInline(jobs);
  return results;
}
