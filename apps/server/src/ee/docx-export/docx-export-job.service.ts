import {
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { randomBytes } from 'crypto';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { User } from '@docmost/db/types/entity.types';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { NotificationService } from '../../core/notification/notification.service';
import { NotificationType } from '../../core/notification/notification.constants';
import { StorageService } from '../../integrations/storage/storage.service';
import { sanitizeFileName } from '../../common/helpers';
import { DocxExportService } from './docx-export.service';
import {
  DOCX_EXPORT_FILES_INDEX,
  DOCX_EXPORT_JOB,
  DOCX_EXPORT_MAX_WAITING,
  DOCX_EXPORT_QUEUE,
  DOCX_LINK_TTL_SEC,
  DocxExportJobData,
  DocxExportResult,
  docxFileKey,
} from './docx-export.constants';

interface StoredFile {
  path: string;
  userId: string;
  fileName: string;
  contentType: string;
}

@Injectable()
export class DocxExportJobService {
  private readonly redis: Redis;

  constructor(
    @InjectQueue(DOCX_EXPORT_QUEUE) private readonly queue: Queue,
    redisService: RedisService,
    private readonly pageRepo: PageRepo,
    private readonly userRepo: UserRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly storage: StorageService,
    private readonly exporter: DocxExportService,
    private readonly notifications: NotificationService,
  ) {
    this.redis = redisService.getOrThrow();
  }

  /** Validates, applies backpressure, and queues the export. */
  async enqueue(
    user: User,
    workspaceId: string,
    body: Omit<DocxExportJobData, 'userId' | 'workspaceId'>,
  ): Promise<{ jobId: string }> {
    const page = await this.pageRepo.findById(body.pageId);
    if (!page || page.deletedAt) throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanView(page, user);

    if ((await this.queue.getWaitingCount()) >= DOCX_EXPORT_MAX_WAITING) {
      throw new ServiceUnavailableException(
        'Export queue is full, please try again in a few minutes',
      );
    }
    const job = await this.queue.add(
      DOCX_EXPORT_JOB,
      {
        pageId: body.pageId,
        includeChildren: !!body.includeChildren,
        singleFile: body.singleFile !== false,
        order: Array.isArray(body.order)
          ? body.order.filter((id) => typeof id === 'string').slice(0, 5000)
          : undefined,
        exclude: Array.isArray(body.exclude)
          ? body.exclude.filter((id) => typeof id === 'string').slice(0, 5000)
          : undefined,
        toc: !!body.toc,
        tocTitle:
          typeof body.tocTitle === 'string'
            ? body.tocTitle.slice(0, 100)
            : undefined,
        userId: user.id,
        workspaceId,
      } satisfies DocxExportJobData,
      {
        removeOnComplete: { age: DOCX_LINK_TTL_SEC },
        removeOnFail: { age: DOCX_LINK_TTL_SEC },
      },
    );
    return { jobId: String(job.id) };
  }

  /** Worker side: builds the file, stores it, registers a TTL'd download token. */
  async run(data: DocxExportJobData): Promise<DocxExportResult> {
    const user = await this.userRepo.findById(data.userId, data.workspaceId);
    if (!user) throw new NotFoundException('User not found');

    const { body, ext, title } = await this.exporter.exportPages(
      data.pageId,
      user,
      data,
    );
    const token = randomBytes(24).toString('hex');
    const fileName = sanitizeFileName(`${title}.${ext}`, {
      preserveSpaces: true,
    });
    const path = `exports/docx/${token}/${fileName}`;
    await this.storage.upload(path, body);

    const expiresAt = Date.now() + DOCX_LINK_TTL_SEC * 1000;
    const stored: StoredFile = {
      path,
      userId: data.userId,
      fileName,
      contentType:
        ext === 'zip'
          ? 'application/zip'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    await this.redis.set(
      docxFileKey(token),
      JSON.stringify(stored),
      'EX',
      DOCX_LINK_TTL_SEC,
    );
    await this.redis.zadd(DOCX_EXPORT_FILES_INDEX, expiresAt, path);
    // Persistent in-app notification carrying the same TTL'd link as the toast.
    const page = await this.pageRepo.findById(data.pageId);
    await this.notifications
      .create({
        userId: data.userId,
        workspaceId: data.workspaceId,
        type: NotificationType.DOCX_EXPORT_READY,
        pageId: data.pageId,
        spaceId: page?.spaceId,
        data: { token, fileName, expiresAt },
      })
      .catch(() => undefined);
    return { token, fileName, expiresAt };
  }

  async status(user: User, jobId: string) {
    const job = await this.queue.getJob(jobId);
    if (!job || job.data.userId !== user.id) {
      throw new NotFoundException('Export not found');
    }
    const state = await job.getState();
    if (state === 'completed') {
      const result = job.returnvalue as DocxExportResult;
      const alive = await this.redis.exists(docxFileKey(result.token));
      return alive ? { state: 'done', ...result } : { state: 'expired' };
    }
    if (state === 'failed') {
      return { state: 'failed', message: job.failedReason };
    }
    return { state: state === 'active' ? 'active' : 'queued' };
  }

  async resolveDownload(user: User, token: string) {
    const raw = await this.redis.get(docxFileKey(token));
    if (!raw) throw new GoneException('Download link has expired');
    const file: StoredFile = JSON.parse(raw);
    if (file.userId !== user.id) throw new NotFoundException();
    return {
      stream: await this.storage.readStream(file.path),
      fileName: file.fileName,
      contentType: file.contentType,
    };
  }
}
