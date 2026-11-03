import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import * as mammoth from 'mammoth';
import { EaAttachmentService } from '../ea-import/ea-attachment.service';

const WEB_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

@Injectable()
export class DocxImportService {
  private readonly logger = new Logger(DocxImportService.name);

  constructor(private readonly attachmentService: EaAttachmentService) {}

  async convertDocxToHtml(
    fileBuffer: Buffer,
    workspaceId: string,
    spaceId: string,
    pageId: string,
    userId: string,
  ): Promise<string> {
    const uploaded: Array<{ attachmentId: string; storageFilePath: string }> =
      [];
    // Same picture repeated in the document -> one attachment.
    const byHash = new Map<string, Promise<{ src: string; id: string }>>();
    let skipped = 0;

    // Images go to storage, not into the page as base64: a 400-page document
    // would otherwise carry MBs of data URIs in content, ydoc, /pages/info and
    // every collab sync.
    const toImg = (mammoth.images as any).imgElement(async (image: any) => {
      const buffer: Buffer = await image.readAsBuffer();
      const hash = createHash('sha1').update(buffer).digest('hex');
      let entry = byHash.get(hash);
      if (!entry) {
        const ext = image.contentType.split('/')[1].split('+')[0];
        entry = this.attachmentService
          .uploadImage({
            buffer,
            fileName: `image-${byHash.size + 1}.${ext}`,
            mimeType: image.contentType,
            pageId,
            workspaceId,
            spaceId,
            creatorId: userId,
          })
          .then((r) => {
            uploaded.push(r);
            return { src: r.apiFilePath, id: r.attachmentId };
          });
        byHash.set(hash, entry);
      }
      const { src, id } = await entry;
      return { src, 'data-attachment-id': id };
    });

    try {
      const result = await mammoth.convertToHtml(
        { buffer: fileBuffer },
        {
          // Skip EMF/WMF/etc before reading them: browsers can't render them
          // and they can be tens of MB each.
          convertImage: (image: any, messages?: any) => {
            if (WEB_IMAGE_TYPES.has(image.contentType))
              return toImg(image, messages);
            skipped++;
            return [];
          },
        } as any,
      );
      if (skipped) {
        this.logger.warn(`DOCX import: dropped ${skipped} non-web image(s)`);
      }
      return result.value;
    } catch (err) {
      // ponytail: only cleans up when conversion fails; a later processHTML /
      // insertPage failure still leaves orphan attachments.
      await this.attachmentService.discardUploaded(uploaded);
      throw err;
    }
  }
}
