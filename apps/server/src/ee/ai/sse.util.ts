import { HttpException } from '@nestjs/common';
import { FastifyReply } from 'fastify';

export function startSse(res: FastifyReply): void {
  res.raw.setHeader('Content-Type', 'text/event-stream');
  res.raw.setHeader('Cache-Control', 'no-cache');
  res.raw.setHeader('Connection', 'keep-alive');
}

export function writeSse(res: FastifyReply, data: unknown): void {
  res.raw.write(
    `data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`,
  );
}

// Only HttpException messages are meant for clients; anything else may leak
// internals (SQL, stack details), so it is replaced by a generic message.
export function sseErrorMessage(err: unknown, fallback: string): string {
  return err instanceof HttpException ? err.message : fallback;
}

/**
 * Pipes an async iterable to the response as SSE `data:` events, ending with
 * `[DONE]`. Stops pulling (and lets the generator clean up) as soon as the
 * client disconnects, and always ends the response.
 */
export async function streamSse(
  res: FastifyReply,
  chunks: AsyncIterable<unknown>,
  fallbackError: string,
): Promise<void> {
  startSse(res);
  try {
    for await (const chunk of chunks) {
      if (res.raw.destroyed) break;
      writeSse(res, chunk);
    }
    writeSse(res, '[DONE]');
  } catch (err) {
    writeSse(res, { error: sseErrorMessage(err, fallbackError) });
  } finally {
    res.raw.end();
  }
}
