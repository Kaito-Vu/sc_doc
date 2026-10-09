import {
  convertModelDocuments,
  eaConvertConcurrency,
} from './ea-convert.pool';
import { readModelDocumentUncompressedSize } from './ea-content.builder';

// A real ZIP containing a single `str.dat` RTF with Vietnamese text.
const VALID_MODEL_DOCUMENT =
  'UEsDBBQAAAAIAJxkSV35ZYTZjgAAALEAAAAHAAAAc3RyLmRhdDWMTQ6CMBCFrzInMEyBQHXligPochJT+wMNpJjS6oL07g4m7r689763U0wOSYXNk7FuUWGsqx53cmtI6bkwVHCNXi2XUujt7Wf2wTSUNdJLRcM1uU0IGG6PCs/3ya5gKIumBQ+aQbSgYaPcSYEAs2fqOwnhsAFPMPwSKXmepn+bQU+HgjXLgV9aNsZDKV9QSwECFAAUAAAACACcZEld+WWE2Y4AAACxAAAABwAAAAAAAAAAAAAAAAAAAAAAc3RyLmRhdFBLBQYAAAAAAQABADUAAACzAAAAAAA=';

describe('convertModelDocuments', () => {
  it('returns an empty map when there are no tasks', async () => {
    const result = await convertModelDocuments([], 16 * 1024 * 1024);
    expect(result.size).toBe(0);
  });

  it('converts documents (inline fallback when no compiled worker exists)', async () => {
    const result = await convertModelDocuments(
      [{ id: 'a', base64: VALID_MODEL_DOCUMENT }],
      16 * 1024 * 1024,
    );
    const converted = result.get('a');
    expect(converted?.error).toBeUndefined();
    expect(converted?.html).toContain('Theo dõi');
  });

  it('records an error for invalid base64/zip input', async () => {
    const result = await convertModelDocuments(
      [{ id: 'bad', base64: 'bm90IGEgemlw' }],
      1024,
    );
    expect(result.get('bad')?.error).toBeTruthy();
  });
});

describe('eaConvertConcurrency', () => {
  it('returns at least one worker', () => {
    expect(eaConvertConcurrency()).toBeGreaterThanOrEqual(1);
  });
});

describe('readModelDocumentUncompressedSize', () => {
  it('reads the uncompressed str.dat size', async () => {
    const size = await readModelDocumentUncompressedSize(
      VALID_MODEL_DOCUMENT,
    );
    expect(typeof size).toBe('number');
    expect(size as number).toBeGreaterThan(0);
  });

  it('returns null for invalid or empty input', async () => {
    expect(await readModelDocumentUncompressedSize('')).toBeNull();
    expect(await readModelDocumentUncompressedSize('bm90IGEgemlw')).toBeNull();
  });
});
