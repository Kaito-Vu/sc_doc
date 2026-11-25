import { BadRequestException } from '@nestjs/common';
import * as path from 'node:path';

export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_TOTAL_RTF_BYTES = 100 * 1024 * 1024;
export const DEFAULT_ALLOWED_EXTENSIONS: readonly string[] = [
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.txt', '.csv',
  '.md', '.rtf', '.odt', '.ods', '.odp',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp',
  '.html', '.htm',
  '.mp4', '.mov', '.webm', '.mp3', '.wav', '.ogg', '.m4a',
  '.zip', '.7z', '.rar',
];

export interface AttachmentSettings {
  maxUploadBytes: number;
  maxTotalRtfBytes: number;
  allowedExtensions: string[];
  allowedMimeTypes: string[];
}

const positiveInt = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export const normalizeExtension = (e: string) => {
  const t = e.trim().toLowerCase();
  return t.startsWith('.') ? t : `.${t}`;
};

// `workspaceSettings` is workspaces.settings (jsonb); missing keys fall back to defaults.
export function resolveAttachmentSettings(
  workspaceSettings: unknown,
): AttachmentSettings {
  const raw = (workspaceSettings as any)?.attachments ?? {};
  return {
    maxUploadBytes: positiveInt(raw.maxUploadBytes, DEFAULT_MAX_UPLOAD_BYTES),
    maxTotalRtfBytes: positiveInt(raw.maxTotalRtfBytes, DEFAULT_MAX_TOTAL_RTF_BYTES),
    // absent => defaults; a saved [] means "allow all"
    allowedExtensions: Array.isArray(raw.allowedExtensions)
      ? strings(raw.allowedExtensions).map(normalizeExtension)
      : [...DEFAULT_ALLOWED_EXTENSIONS],
    allowedMimeTypes: strings(raw.allowedMimeTypes).map((m) => m.trim().toLowerCase()),
  };
}

export function assertFileAllowed(
  cfg: AttachmentSettings,
  fileName: string,
  mimeType: string | undefined,
): void {
  const reject = () => {
    throw new BadRequestException(`File type not allowed: ${fileName}`);
  };

  if (cfg.allowedExtensions.length > 0) {
    const ext = path.extname(fileName ?? '').toLowerCase();
    if (!ext || !cfg.allowedExtensions.includes(ext)) reject();
  }

  if (cfg.allowedMimeTypes.length > 0) {
    const mime = (mimeType ?? '').split(';')[0].trim().toLowerCase();
    const ok = cfg.allowedMimeTypes.some((m) =>
      m.endsWith('/*') ? mime.startsWith(m.slice(0, -1)) : mime === m,
    );
    if (!ok) reject();
  }
}
