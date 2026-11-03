import * as fs from 'fs';
import * as path from 'path';
import { DocxImportService } from './docx-import.service';

const sample = path.resolve(
  __dirname,
  '../../../../../samples/sample_import_docx_error_2.docx',
);

(fs.existsSync(sample) ? describe : describe.skip)('DocxImportService', () => {
  it('stores web images as attachments instead of base64 and drops EMF', async () => {
    let n = 0;
    const attachments = {
      uploadImage: jest.fn(async () => {
        const attachmentId = `att-${++n}`;
        return {
          attachmentId,
          apiFilePath: `/api/files/${attachmentId}/x.png`,
          imgHtml: '',
          storageFilePath: `p/${attachmentId}`,
        };
      }),
      discardUploaded: jest.fn(),
    };
    const service = new DocxImportService(attachments as any);

    const html = await service.convertDocxToHtml(
      fs.readFileSync(sample),
      'ws',
      'space',
      'page',
      'user',
    );

    expect(html).not.toContain('data:image');
    expect(html).toContain('data-attachment-id="att-1"');
    expect(attachments.uploadImage).toHaveBeenCalled();
    expect(attachments.discardUploaded).not.toHaveBeenCalled();
    expect(html.length).toBeLessThan(1.5 * 1024 * 1024);
  }, 60000);
});
