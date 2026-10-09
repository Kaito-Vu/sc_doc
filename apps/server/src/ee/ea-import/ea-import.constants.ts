/**
 * EE-local queue constants for the asynchronous Enterprise Architect import.
 * Kept separate from the core queue constants so the feature needs no core
 * queue wiring changes.
 */
export const EA_IMPORT_QUEUE = '{ea-import-queue}';
export const EA_IMPORT_JOB = 'ea-import';
export const EA_IMPORT_MAX_FILE_SIZE = '30mb';
