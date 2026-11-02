import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Worker } from 'worker_threads';
import { EaCpuJob, EaCpuResult, runEaCpuJob } from './ea-cpu.tasks';

/** Compiled worker next to this module (`dist/ee/ea-import/...`). */
const WORKER_FILE = path.join(__dirname, 'ea-cpu.worker.js');

/** Below this many jobs a worker's startup cost outweighs the parallelism. */
const MIN_JOBS_FOR_WORKERS = 6;

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

const CHUNK_TIMEOUT_MS = 10 * 60 * 1000;

function runChunk(
  jobs: EaCpuJob[],
  onResult: (result: EaCpuResult) => void,
  workers: Set<Worker>,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const worker = new Worker(WORKER_FILE, {
      // A runaway conversion must kill only this worker, not the API process.
      resourceLimits: { maxOldGenerationSizeMb: 768 },
    });
    workers.add(worker);
    let settled = false;
    // A worker stuck in a pathological conversion would otherwise hang the import forever.
    const timer = setTimeout(
      () => finish(new Error(`EA cpu worker timed out after ${CHUNK_TIMEOUT_MS / 1000}s`)),
      CHUNK_TIMEOUT_MS,
    );
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      workers.delete(worker);
      void worker.terminate().catch(() => undefined);
      error ? reject(error) : resolve();
    };
    worker.on('message', (message: any) => {
      if (message?.done) return finish();
      onResult(rehydrate(message));
    });
    worker.on('error', (e) => finish(e instanceof Error ? e : new Error(String(e))));
    worker.on('exit', (code) => {
      if (!settled) {
        finish(new Error(`EA cpu worker exited with code ${code} before finishing`));
      }
    });
    worker.postMessage(jobs);
  });
}

/**
 * Run CPU-bound jobs across worker threads (round-robin), falling back to
 * inline execution for few jobs or a missing worker file. `onResult` fires per
 * finished job (progress / cancellation hook); it may throw to abort the whole
 * run, which also stops the workers.
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

  const concurrency = Math.min(eaConvertConcurrency(), jobs.length);
  if (
    (jobs.length < MIN_JOBS_FOR_WORKERS && !opts.forceWorkers) ||
    concurrency < 1 ||
    (concurrency === 1 && !opts.forceWorkers) ||
    !fs.existsSync(WORKER_FILE)
  ) {
    for (const job of jobs) {
      await record(await runEaCpuJob(job));
      // let the event loop breathe between jobs
      await new Promise((resolve) => setImmediate(resolve));
    }
    return results;
  }

  const chunks: EaCpuJob[][] = Array.from({ length: concurrency }, () => []);
  jobs.forEach((job, i) => chunks[i % concurrency].push(job));

  // Results are replayed on this async chain so `onResult` can await (and
  // throw) without racing worker message events.
  const workers = new Set<Worker>();
  let chain: Promise<void> = Promise.resolve();
  let abort: unknown;
  const enqueue = (result: EaCpuResult): void => {
    chain = chain.then(async () => {
      if (abort !== undefined) return;
      try {
        await record(result);
      } catch (e) {
        abort = e ?? new Error('aborted');
        workers.forEach((worker) => void worker.terminate().catch(() => undefined));
      }
    });
  };

  const failures = await Promise.all(
    chunks
      .filter((chunk) => chunk.length > 0)
      .map((chunk) =>
        runChunk(chunk, enqueue, workers).then(
          () => undefined,
          (error: Error) => error,
        ),
      ),
  );
  await chain;
  if (abort !== undefined) throw abort;

  // A crashed or timed-out worker (e.g. out of memory on a hostile file) leaves
  // its jobs unfinished. Never re-run them inline (that could take the API
  // process down), and never report them as per-job errors: the caller would
  // commit blank pages and mark the task successful. Fail the whole run.
  const failure = failures.find(Boolean);
  if (jobs.some((job) => !results.has(job.id))) {
    throw new Error(
      `EA import worker failed: ${failure?.message ?? 'no result'}`,
    );
  }
  return results;
}
