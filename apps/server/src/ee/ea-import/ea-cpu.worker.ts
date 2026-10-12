/**
 * Worker-thread entry point: runs a slice of CPU-bound EA jobs (XML parse,
 * HTML -> ProseMirror -> Yjs) off the main event loop and posts one result per
 * job, then `{ done: true }`.
 */
import { parentPort } from 'worker_threads';
import { EaCpuJob, runEaCpuJob } from './ea-cpu.tasks';

parentPort?.on('message', (jobs: EaCpuJob[]) => {
  for (const job of jobs) {
    parentPort?.postMessage(runEaCpuJob(job));
  }
  parentPort?.postMessage({ done: true });
});
