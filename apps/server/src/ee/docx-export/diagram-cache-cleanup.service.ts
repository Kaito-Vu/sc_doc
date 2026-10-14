import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import {
  DIAGRAM_CACHE_INDEX,
  DOCX_EXPORT_FILES_INDEX,
} from './docx-export.constants';
import { StorageService } from '../../integrations/storage/storage.service';

const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH = 500;

@Injectable()
export class DiagramCacheCleanupService {
  private readonly logger = new Logger(DiagramCacheCleanupService.name);
  private readonly redis: Redis;

  constructor(
    redisService: RedisService,
    private readonly storage: StorageService,
  ) {
    this.redis = redisService.getOrThrow();
  }

  // Storage drivers cannot list objects, so entries are tracked in Redis.
  // Idempotent, so running on several instances is harmless.
  @Cron('0 3 * * *')
  async cleanup() {
    const removed = await this.sweep(DIAGRAM_CACHE_INDEX, Date.now() - TTL_MS);
    if (removed)
      this.logger.log(`diagram cache: removed ${removed} stale PNGs`);
  }

  /** Deletes exported files whose download link has expired. */
  @Cron('*/10 * * * *')
  async cleanupExports() {
    await this.sweep(DOCX_EXPORT_FILES_INDEX, Date.now());
  }

  /** Deletes every object in the index scored <= cutoff; stops at the first failure to retry next run. */
  private async sweep(index: string, cutoff: number): Promise<number> {
    let removed = 0;
    for (;;) {
      const keys = await this.redis.zrangebyscore(
        index,
        0,
        cutoff,
        'LIMIT',
        0,
        BATCH,
      );
      if (keys.length === 0) return removed;
      for (const key of keys) {
        try {
          await this.storage.delete(key);
          await this.redis.zrem(index, key);
          removed++;
        } catch (err) {
          this.logger.warn(`docx export: failed to delete ${key}: ${err}`);
          return removed;
        }
      }
    }
  }
}
