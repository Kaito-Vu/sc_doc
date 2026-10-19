import { EaAttachmentService } from './ea-attachment.service';
import { resolveImageForDiagram } from './ea-asset.util';
import { errorMessage } from './ea-import.util';
import {
  eaRtfImagePlaceholder,
  stripEaRtfImagePlaceholders,
} from './rtf-to-html';
import { buildWireframeDrawioSvg, drawioNodeHtml } from './ea-wireframe';
import {
  EaDiagram,
  EaImageAsset,
  EaPackageNode,
  EaParseWarning,
  EaRtfImage,
} from './types/ea-import.types';

const MAX_IMAGES = 200;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 64 * 1024 * 1024;
/** Same file name the editor's draw.io macro saves. */
const DRAWIO_FILE_NAME = 'diagram.drawio.svg';

export interface EaImageContext {
  workspaceId: string;
  spaceId: string;
  creatorId: string;
}

/**
 * Uploads one import's diagram and RTF images as page attachments, sharing a
 * count + byte budget across every page of the import. Uploads happen before
 * the page transaction; a failed or over-budget image becomes a warning and
 * never aborts the import.
 */
export class EaImageEmbedder {
  private count = 0;
  private bytes = 0;

  constructor(
    private readonly attachments: EaAttachmentService,
    private readonly context: EaImageContext,
    private readonly byKey: Map<string, EaImageAsset>,
    private readonly warnings: EaParseWarning[],
  ) {}

  /**
   * Resolve and upload the companion (or embedded) image for every diagram
   * owned by a page, returning a map from diagram key to `<img>` HTML.
   * Diagrams with no image but Wireframing controls become a draw.io node.
   */
  async diagramImages(
    node: EaPackageNode,
    pageId: string,
    pageTitle: string,
  ): Promise<Map<string, string>> {
    const imageHtmlById = new Map<string, string>();

    for (const diagram of node.diagrams) {
      const key = diagram.diagramId ?? diagram.name;
      if (imageHtmlById.has(key)) {
        continue;
      }
      const asset =
        resolveImageForDiagram(diagram, this.byKey) ?? diagram.embeddedImage;
      if (!asset) {
        if (diagram.wireframe?.length) {
          const html = await this.uploadWireframeDrawio(
            diagram,
            pageId,
            pageTitle,
          );
          if (html) {
            imageHtmlById.set(key, html);
          }
        }
        continue;
      }

      const html = await this.upload(
        'Diagram',
        asset.fileName,
        {
          buffer: asset.buffer,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          pageId,
        },
        pageTitle,
      );
      if (html === false) {
        break;
      }
      if (html) {
        imageHtmlById.set(key, html);
      }
    }

    return imageHtmlById;
  }

  /**
   * Upload every `\pict` image extracted from a page's RTF documents and swap
   * its placeholder for the returned `<img>` HTML. Placeholders of dropped
   * images are removed.
   */
  async embedRtfImages(
    html: string,
    images: EaRtfImage[],
    pageId: string,
    pageTitle: string,
  ): Promise<string> {
    if (images.length === 0) {
      return html;
    }

    let result = html;
    for (let index = 0; index < images.length; index += 1) {
      const placeholder = eaRtfImagePlaceholder(index);
      if (!result.includes(placeholder)) {
        continue;
      }
      const image = images[index];
      const ext =
        image.mimeType === 'image/png'
          ? '.png'
          : image.mimeType === 'image/jpeg'
            ? '.jpg'
            : '';
      const imgHtml = await this.upload(
        'RTF',
        String(index),
        {
          buffer: image.buffer,
          fileName: `rtf-image-${index}${ext}`,
          mimeType: image.mimeType,
          pageId,
        },
        pageTitle,
      );
      if (imgHtml === false) {
        break;
      }
      if (imgHtml) {
        result = result.split(placeholder).join(imgHtml);
      }
    }

    return stripEaRtfImagePlaceholders(result);
  }

  /**
   * Upload one image within the budget. Returns its `<img>` HTML, null when
   * this image was skipped, or false when the budget is spent (stop trying).
   */
  private async upload(
    kind: 'Diagram' | 'RTF',
    label: string,
    image: { buffer: Buffer; fileName: string; mimeType: string; pageId: string },
    pageTitle: string,
  ): Promise<string | null | false> {
    const size = image.buffer.length;
    if (this.count >= MAX_IMAGES) {
      this.warn(
        pageTitle,
        `${kind} image limit reached (${MAX_IMAGES}); remaining images were skipped.`,
      );
      return false;
    }
    if (size > MAX_IMAGE_BYTES) {
      this.warn(
        pageTitle,
        `${kind} image ${label} exceeds the 8 MB limit and was skipped.`,
      );
      return null;
    }
    if (this.bytes + size > MAX_TOTAL_IMAGE_BYTES) {
      this.warn(
        pageTitle,
        `${kind} images exceed the 64 MB total limit; remaining images were skipped.`,
      );
      return false;
    }

    // Reserve before the await: pages upload concurrently.
    this.count += 1;
    this.bytes += size;
    try {
      const uploaded = await this.attachments.uploadImage({
        ...image,
        ...this.context,
      });
      return uploaded.imgHtml;
    } catch (error) {
      this.count -= 1;
      this.bytes -= size;
      this.warn(
        pageTitle,
        `Failed to import ${kind === 'RTF' ? 'RTF' : 'diagram'} image ${label}: ${errorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Turn a diagram's Wireframing controls into an editable draw.io node.
   * Returns null (with a warning) when the upload fails.
   */
  private async uploadWireframeDrawio(
    diagram: EaDiagram,
    pageId: string,
    pageTitle: string,
  ): Promise<string | null> {
    try {
      const buffer = Buffer.from(
        buildWireframeDrawioSvg(diagram.wireframe ?? []),
        'utf-8',
      );
      const uploaded = await this.attachments.uploadImage({
        buffer,
        fileName: DRAWIO_FILE_NAME,
        mimeType: 'image/svg+xml',
        pageId,
        ...this.context,
      });
      return drawioNodeHtml({
        src: uploaded.apiFilePath,
        attachmentId: uploaded.attachmentId,
        fileName: DRAWIO_FILE_NAME,
        size: buffer.length,
      });
    } catch (error) {
      this.warn(
        pageTitle,
        `Failed to convert wireframe ${diagram.name} to draw.io: ${errorMessage(error)}`,
      );
      return null;
    }
  }

  private warn(page: string, reason: string): void {
    this.warnings.push({ page, reason });
  }
}
