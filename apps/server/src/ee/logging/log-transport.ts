import { join } from 'node:path';
import pino, { type DestinationStream, type TransportTargetOptions } from 'pino';

// Env (all optional):
//   LOG_TO_FILE=true|false   write logs to rotating files too (default true)
//   LOG_DIR=logs             directory for log files
//   LOG_FILE_MAX_SIZE=20m    rotate when a file reaches this size
//   LOG_FILE_MAX_FILES=300   rotated files to keep. pino-roll prunes by file
//                            count, not age: daily + size rotation at 20m keeps
//                            well over a month unless >10 files/day are produced.
function buildLogTargets(
  level: string,
  isProduction: boolean,
): TransportTargetOptions[] {
  const targets: TransportTargetOptions[] = [
    isProduction
      ? { target: 'pino/file', level, options: { destination: 1 } }
      : {
          target: 'pino-pretty',
          level,
          options: {
            colorize: true,
            singleLine: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
  ];

  if (process.env.LOG_TO_FILE?.toLowerCase() !== 'false') {
    const count = parseInt(process.env.LOG_FILE_MAX_FILES ?? '', 10);
    targets.push({
      target: 'pino-roll',
      level,
      options: {
        file: join(process.env.LOG_DIR || 'logs', 'app'),
        extension: '.log',
        dateFormat: 'yyyy-MM-dd',
        frequency: 'daily',
        size: process.env.LOG_FILE_MAX_SIZE || '20m',
        mkdir: true,
        limit: { count: Number.isFinite(count) && count > 0 ? count : 300 },
      },
    });
  }
  return targets;
}

// Built as a stream (not the `transport` option) so pino's custom level
// formatter in pino.config.ts stays allowed alongside multiple targets.
export function buildLogStream(
  level: string,
  isProduction: boolean,
): DestinationStream {
  const targets = buildLogTargets(level, isProduction);
  try {
    return pino.transport({ targets });
  } catch (err) {
    // A target could not be loaded (e.g. pino-roll not installed). Keep the
    // server up with the console target only, and say loudly why.
    console.error(
      'Log file transport unavailable, logging to console only. ' +
        'Install it with `pnpm --filter ./apps/server add pino-roll` or set LOG_TO_FILE=false.',
      err,
    );
    return pino.transport({ targets: targets.slice(0, 1) });
  }
}
