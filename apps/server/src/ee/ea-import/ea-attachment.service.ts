import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { v7 } from 'uuid';
import * as path from 'path';
import { Readable } from 'stream';
import { imageDimensionsFromData } from 'image-dimensions';
import { sanitizeFileName } from '../../common/helpers';
import { getAttachmentFolderPath } from '../../core/attachment/attachment.utils';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import { StorageService } from '../../integrations/storage/storage.service';

const DEFAULT_IMAGE_WIDTH = '800';

function escapeHtmlAttribute(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class EaAttachmentService {
  private readonly logger = new Logger(EaAttachmentService.name);

  constructor(
    private readonly storageService: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async uploadImage(opts: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    pageId: string;
    workspaceId: string;
    spaceId: string;
    creatorId: string;
  }): Promise<{
    attachmentId: string;
    apiFilePath: string;
    imgHtml: string;
  }> {
    const { buffer, mimeType, pageId, workspaceId, spaceId, creatorId } = opts;

    const fileName = sanitizeFileName(opts.fileName) || 'diagram.png';
    const attachmentId = v7();
    const storageFilePath = `${getAttachmentFolderPath(
      AttachmentType.File,
      workspaceId,
    )}/${attachmentId}/${fileName}`;
    const apiFilePath = `/api/files/${attachmentId}/${fileName}`;

    await this.storageService.uploadStream(
      storageFilePath,
      Readable.from(buffer),
      { recreateClient: true },
    );

    await this.db
      .insertInto('attachments')
      .values({
        id: attachmentId,
        filePath: storageFilePath,
        fileName,
        fileSize: buffer.length,
        mimeType,
        type: 'file',
        fileExt: path.extname(fileName).toLowerCase(),
        creatorId,
        workspaceId,
        pageId,
        spaceId,
      })
      .execute();

    let width = DEFAULT_IMAGE_WIDTH;
    if (mimeType.startsWith('image/') && mimeType !== 'image/svg+xml') {
      try {
        const dimensions = imageDimensionsFromData(new Uint8Array(buffer));
        if (dimensions && dimensions.width) {
          width = String(dimensions.width);
        }
      } catch {
        // fall back to the default width
      }
    }

    const imgHtml =
      '<img src="' +
      escapeHtmlAttribute(apiFilePath) +
      '" data-attachment-id="' +
      escapeHtmlAttribute(attachmentId) +
      '" width="' +
      escapeHtmlAttribute(width) +
      '" data-align="center">';

    this.logger.debug(`Uploaded EA diagram image ${fileName} (${attachmentId})`);

    return { attachmentId, apiFilePath, imgHtml };
  }
}
