import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { markdownToHtml } from '@docmost/editor-ext';

// Converts PDF -> Markdown via the internal MarkItDown sidecar (./markitdown), then -> HTML.
@Injectable()
export class PdfImportService {
  private readonly logger = new Logger(PdfImportService.name);

  async convertPdfToHtml(
    fileBuffer: Buffer,
    _workspaceId: string,
    _spaceId: string,
    _pageId: string,
    _userId: string,
  ): Promise<string> {
    if (!fileBuffer.toString('utf8', 0, Math.min(fileBuffer.length, 1024)).includes('%PDF')) {
      throw new BadRequestException('Invalid PDF file');
    }

    const url = process.env.MARKITDOWN_URL || 'http://markitdown:8000';
    let res: Response;
    try {
      res = await fetch(`${url}/convert`, {
        method: 'POST',
        body: fileBuffer as any,
        signal: AbortSignal.timeout(15 * 60_000),
      });
    } catch (err) {
      this.logger.error(`MarkItDown unreachable: ${(err as Error).message}`);
      throw new BadRequestException('PDF conversion service is unavailable');
    }
    if (!res.ok) {
      this.logger.error(`MarkItDown ${res.status}: ${await res.text()}`);
      throw new BadRequestException('Failed to convert PDF');
    }

    const markdown = (await res.text()).trim();
    if (!markdown) {
      throw new BadRequestException(
        'No text found in PDF (scanned/image-only PDFs are not supported)',
      );
    }
    try {
      return await markdownToHtml(markdown);
    } catch (err) {
      // ImportService swallows the cause, so log it here.
      this.logger.error(
        `markdownToHtml failed: ${(err as Error).stack}\n--- markdown head ---\n${markdown.slice(0, 500)}`,
      );
      throw err;
    }
  }
}
