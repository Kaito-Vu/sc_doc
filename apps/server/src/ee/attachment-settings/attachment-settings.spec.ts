import { BadRequestException } from '@nestjs/common';
import {
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_MAX_TOTAL_RTF_BYTES,
  DEFAULT_MAX_UPLOAD_BYTES,
  assertFileAllowed,
  resolveAttachmentSettings,
} from './attachment-settings';

const cfg = (over: Partial<ReturnType<typeof resolveAttachmentSettings>> = {}) => ({
  ...resolveAttachmentSettings(undefined),
  ...over,
});

describe('resolveAttachmentSettings', () => {
  it('applies defaults for undefined / {}', () => {
    for (const input of [undefined, {}, { attachments: {} }]) {
      expect(resolveAttachmentSettings(input)).toEqual({
        maxUploadBytes: 10 * 1024 * 1024,
        maxTotalRtfBytes: 100 * 1024 * 1024,
        allowedExtensions: [...DEFAULT_ALLOWED_EXTENSIONS],
        allowedMimeTypes: [],
      });
    }
    expect(DEFAULT_MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
    expect(DEFAULT_MAX_TOTAL_RTF_BYTES).toBe(100 * 1024 * 1024);
  });

  it('falls back to defaults for garbage numbers', () => {
    for (const bad of ['abc', -1, 0, null, NaN]) {
      const r = resolveAttachmentSettings({
        attachments: { maxUploadBytes: bad, maxTotalRtfBytes: bad },
      });
      expect(r.maxUploadBytes).toBe(DEFAULT_MAX_UPLOAD_BYTES);
      expect(r.maxTotalRtfBytes).toBe(DEFAULT_MAX_TOTAL_RTF_BYTES);
    }
  });

  it('passes configured values through and keeps a saved empty list', () => {
    const r = resolveAttachmentSettings({
      attachments: {
        maxUploadBytes: 5,
        maxTotalRtfBytes: 7,
        allowedExtensions: [],
        allowedMimeTypes: ['Image/*'],
      },
    });
    expect(r).toEqual({
      maxUploadBytes: 5,
      maxTotalRtfBytes: 7,
      allowedExtensions: [],
      allowedMimeTypes: ['image/*'],
    });
  });

  it('normalizes extensions (lowercase, leading dot)', () => {
    const r = resolveAttachmentSettings({
      attachments: { allowedExtensions: ['PDF', '.Docx', 3] },
    });
    expect(r.allowedExtensions).toEqual(['.pdf', '.docx']);
  });

  it('default list covers every editor upload type', () => {
    for (const e of ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.mp4', '.mov', '.webm', '.mp3', '.wav', '.ogg', '.m4a', '.docx', '.xlsx', '.pptx', '.html', '.htm']) {
      expect(DEFAULT_ALLOWED_EXTENSIONS).toContain(e);
    }
  });
});

describe('assertFileAllowed', () => {
  it('rejects dangerous extensions by default', () => {
    for (const f of ['a.exe', 'a.js', 'a.sh']) {
      expect(() => assertFileAllowed(cfg(), f, undefined)).toThrow(BadRequestException);
    }
  });

  it('allows anything when the extension list is empty', () => {
    expect(() => assertFileAllowed(cfg({ allowedExtensions: [] }), 'a.exe', 'x/y')).not.toThrow();
  });

  it('matches case-insensitively on the last extension', () => {
    const c = cfg({ allowedExtensions: ['.pdf', '.gz'] });
    expect(() => assertFileAllowed(c, 'A.PDF', undefined)).not.toThrow();
    expect(() => assertFileAllowed(c, 'a.tar.GZ', undefined)).not.toThrow();
  });

  it('rejects files without extension when a list is set', () => {
    expect(() => assertFileAllowed(cfg({ allowedExtensions: ['.pdf'] }), 'README', undefined)).toThrow(BadRequestException);
  });

  it('mime wildcard and params', () => {
    const c = cfg({ allowedExtensions: [], allowedMimeTypes: ['image/*', 'text/plain'] });
    expect(() => assertFileAllowed(c, 'a.png', 'image/png')).not.toThrow();
    expect(() => assertFileAllowed(c, 'a.txt', 'text/plain; charset=utf-8')).not.toThrow();
    expect(() => assertFileAllowed(c, 'a.png', 'imagex/png')).toThrow(BadRequestException);
  });

  it('requires both lists to match when both are set; message names the file', () => {
    const c = cfg({ allowedExtensions: ['.png'], allowedMimeTypes: ['image/png'] });
    expect(() => assertFileAllowed(c, 'a.png', 'image/png')).not.toThrow();
    expect(() => assertFileAllowed(c, 'my-file.png', 'application/pdf')).toThrow(/my-file\.png/);
  });
});
