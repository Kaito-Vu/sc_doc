/** EE-local queue constants so the feature needs no core queue wiring changes. */
export const DOCX_EXPORT_QUEUE = '{docx-export-queue}';
export const DOCX_EXPORT_JOB = 'docx-export';

/** How many exports may run at once on this instance (each may use Chromium). */
export const DOCX_EXPORT_CONCURRENCY = 2;
/** Backpressure: reject new exports once this many jobs are waiting. */
export const DOCX_EXPORT_MAX_WAITING = 50;

/** Download link / exported file lifetime. */
export const DOCX_LINK_TTL_SEC = 60 * 60;

export const docxFileKey = (token: string) => `docx-export:file:${token}`;
/** Redis sorted set: member = storage path, score = expiry epoch ms (storage cannot list objects). */
export const DOCX_EXPORT_FILES_INDEX = 'docx-export-files';
/** Redis sorted set: member = storage key of a cached diagram PNG, score = last-used epoch ms. */
export const DIAGRAM_CACHE_INDEX = 'docx-diagram-cache';

export interface DocxExportOptions {
  includeChildren?: boolean;
  singleFile?: boolean;
  /** Page ids in the desired export order (siblings are reordered, hierarchy is kept). */
  order?: string[];
  /** Subpage ids to leave out (their subtrees are skipped too). */
  exclude?: string[];
  /** Prepend a table of contents (single file only). */
  toc?: boolean;
  tocTitle?: string;
}

export interface DocxExportJobData extends DocxExportOptions {
  pageId: string;
  userId: string;
  workspaceId: string;
}

export interface DocxExportResult {
  token: string;
  fileName: string;
  expiresAt: number;
}
