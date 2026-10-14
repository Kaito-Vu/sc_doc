import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { DOCX_EXPORT_FILES_INDEX } from './docx-export.constants';
import { StorageService } from '../../integrations/storage/storage.service';

/** Redis sorted set: member = storage key of a cached diagram PNG, score = last-used epoch ms. */
export const DIAGRAM_CACHE_INDEX = 'docx-diagram-cache';
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
    const cutoff = Date.now() - TTL_MS;
    let removed = 0;
    for (;;) {
      const keys = await this.redis.zrangebyscore(
        DIAGRAM_CACHE_INDEX,
        0,
        cutoff,
        'LIMIT',
        0,
        BATCH,
      );
      if (keys.length === 0) break;
      for (const key of keys) {
        try {
          await this.storage.delete(key);
          await this.redis.zrem(DIAGRAM_CACHE_INDEX, key);
          removed++;
        } catch (err) {
          this.logger.warn(`diagram cache: failed to delete ${key}: ${err}`);
          return; // retry next run instead of looping on a failing key
        }
      }
    }
    if (removed)
      this.logger.log(`diagram cache: removed ${removed} stale PNGs`);
  }

  /** Deletes exported files whose download link has expired. */
  @Cron('*/10 * * * *')
  async cleanupExports() {
    const now = Date.now();
    for (;;) {
      const paths = await this.redis.zrangebyscore(
        DOCX_EXPORT_FILES_INDEX,
        0,
        now,
        'LIMIT',
        0,
        BATCH,
      );
      if (paths.length === 0) return;
      for (const path of paths) {
        try {
          await this.storage.delete(path);
          await this.redis.zrem(DOCX_EXPORT_FILES_INDEX, path);
        } catch (err) {
          this.logger.warn(`docx export: failed to delete ${path}: ${err}`);
          return;
        }
      }
    }
  }
}
