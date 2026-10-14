/** EE-local queue constants so the feature needs no core queue wiring changes. */
export const DOCX_EXPORT_QUEUE = '{docx-export-queue}';
export const DOCX_EXPORT_JOB = 'docx-export';

/** How many exports may run at once on this instance (each may use Chromium). */
export const DOCX_EXPORT_CONCURRENCY = 2;
/** Backpressure: reject new exports once waiting jobs reach (active users x this). */
export const DOCX_EXPORT_QUEUE_PER_USER = 7;

/** Download link / exported file lifetime. */
export const DOCX_LINK_TTL_SEC = 60 * 60;

export const docxFileKey = (token: string) => `docx-export:file:${token}`;
/** Redis sorted set: member = storage path, score = expiry epoch ms (storage cannot list objects). */
export const DOCX_EXPORT_FILES_INDEX = 'docx-export-files';

export interface DocxExportOptions {
  includeChildren?: boolean;
  singleFile?: boolean;
  /** Page ids in the desired export order (siblings are reordered, hierarchy is kept). */
  order?: string[];
  /** Prepend a table of contents (single file only). */
  toc?: boolean;
  tocTitle?: string;
}

export interface DocxExportJobData extends DocxExportOptions {
  pageId: string;
  userId: string;
  workspaceId: string;
  includeChildren?: boolean;
  singleFile?: boolean;
}

export interface DocxExportResult {
  token: string;
  fileName: string;
  expiresAt: number;
}
