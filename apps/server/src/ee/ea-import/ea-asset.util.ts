import * as path from 'path';
import * as yauzl from 'yauzl';
import { EaDiagram, EaImageAsset } from './types/ea-import.types';

/**
 * Pure helpers for the EA import companion assets (the ZIP container and its
 * `Images/` folder). No Nest / DB dependencies: deterministic and unit-testable.
 */

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const MAX_ENTRIES = 2000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

const XMI_EXTENSIONS = new Set(['.xml', '.xmi']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']);
const HTML_EXTENSIONS = new Set(['.htm', '.html']);

export interface EaArchiveHtmlPage {
  relativePath: string;
  html: Buffer;
}

export interface EaArchiveHtmlImage {
  relativePath: string;
  mimeType: string;
  buffer: Buffer;
}

export interface EaArchiveInspection {
  xmi: Buffer | null;
  images: EaImageAsset[];
  htmlPages: EaArchiveHtmlPage[];
  htmlImages: EaArchiveHtmlImage[];
}

export function isZipBuffer(buffer: Buffer): boolean {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= ZIP_SIGNATURE.length &&
    buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE)
  );
}

export function normalizeAssetKey(name: string): string {
  const base = path.basename(String(name ?? ''));
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return stem.toLowerCase().replace(/-/g, '_');
}

export function mimeTypeForImageExt(ext: string): string {
  switch (String(ext ?? '').toLowerCase().replace(/^\./, '')) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
    case 'svg+xml':
      return 'image/svg+xml';
    default:
      return 'application/octet-stream';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Read an EA companion ZIP exactly once and collect everything the importer
 * may need: the first `.xml`/`.xmi` document, every image entry (keyed for the
 * XMI diagram-matching path and with a `relativePath` for the HTML path), and
 * every `.htm`/`.html` page. Bounded to 2,000 entries and 64 MB of cumulative
 * uncompressed size.
 */
export function inspectEaArchive(
  buffer: Buffer,
): Promise<EaArchiveInspection> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (openError, zipfile) => {
        if (openError || !zipfile) {
          reject(
            new Error(`Failed to open EA archive: ${errorMessage(openError)}`),
          );
          return;
        }

        let settled = false;
        let entryCount = 0;
        let totalUncompressed = 0;
        let xmi: Buffer | null = null;
        const images: EaImageAsset[] = [];
        const htmlPages: EaArchiveHtmlPage[] = [];
        const htmlImages: EaArchiveHtmlImage[] = [];

        const fail = (error: unknown): void => {
          if (settled) {
            return;
          }
          settled = true;
          try {
            zipfile.close();
          } catch {
            // ignore close errors
          }
          reject(error instanceof Error ? error : new Error(String(error)));
        };

        zipfile.on('entry', (entry) => {
          entryCount += 1;
          if (entryCount > MAX_ENTRIES) {
            fail(
              new Error(
                `EA archive exceeds the ${MAX_ENTRIES} entry limit`,
              ),
            );
            return;
          }

          const name = entry.fileName;
          if (name.endsWith('/')) {
            zipfile.readEntry();
            return;
          }

          totalUncompressed += entry.uncompressedSize;
          if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
            fail(
              new Error(
                `EA archive exceeds the ${MAX_TOTAL_UNCOMPRESSED_BYTES} byte uncompressed limit`,
              ),
            );
            return;
          }

          const ext = path.extname(name.toLowerCase());
          const isImage = IMAGE_EXTENSIONS.has(ext);
          const isXmi = xmi === null && XMI_EXTENSIONS.has(ext);
          const isHtml = HTML_EXTENSIONS.has(ext);
          if (!isImage && !isXmi && !isHtml) {
            zipfile.readEntry();
            return;
          }

          zipfile.openReadStream(entry, (streamError, stream) => {
            if (streamError || !stream) {
              fail(
                new Error(
                  `Failed to open EA archive entry ${name}: ${errorMessage(
                    streamError,
                  )}`,
                ),
              );
              return;
            }

            const chunks: Buffer[] = [];
            stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            stream.on('error', (readError) =>
              fail(
                new Error(
                  `Failed to read EA archive entry ${name}: ${errorMessage(
                    readError,
                  )}`,
                ),
              ),
            );
            stream.on('end', () => {
              if (settled) {
                return;
              }
              const data = Buffer.concat(chunks);
              if (data.length > 0) {
                if (isXmi) {
                  xmi = data;
                } else if (isImage) {
                  const mimeType = mimeTypeForImageExt(ext);
                  images.push({
                    key: normalizeAssetKey(name),
                    fileName: name,
                    mimeType,
                    buffer: data,
                  });
                  htmlImages.push({
                    relativePath: name,
                    mimeType,
                    buffer: data,
                  });
                } else if (isHtml) {
                  htmlPages.push({ relativePath: name, html: data });
                }
              }
              zipfile.readEntry();
            });
          });
        });

        zipfile.on('error', (archiveError) =>
          fail(
            new Error(`EA archive error: ${errorMessage(archiveError)}`),
          ),
        );

        zipfile.on('end', () => {
          if (settled) {
            return;
          }
          settled = true;
          try {
            zipfile.close();
          } catch {
            // ignore close errors
          }
          resolve({ xmi, images, htmlPages, htmlImages });
        });

        zipfile.readEntry();
      },
    );
  });
}

/**
 * Extract the XMI document plus every image entry from an EA companion ZIP.
 * The XMI is the first `.xml`/`.xmi` entry; images are every entry whose
 * extension is a supported image extension.
 */
export async function extractEaZip(
  buffer: Buffer,
): Promise<{ xmi: Buffer; images: EaImageAsset[] }> {
  const { xmi, images } = await inspectEaArchive(buffer);
  if (!xmi) {
    throw new Error('EA archive does not contain an .xml or .xmi entry');
  }
  return { xmi, images };
}

/**
 * Resolve the companion image for a diagram by, in order: `diagramId`,
 * `imageId`, then `name`.
 */
export function resolveImageForDiagram(
  diagram: EaDiagram,
  byKey: Map<string, EaImageAsset>,
): EaImageAsset | undefined {
  const candidates: Array<string | undefined> = [];
  if (diagram.diagramId) {
    candidates.push(normalizeAssetKey(diagram.diagramId));
  }
  if (diagram.imageId !== undefined && diagram.imageId !== null) {
    candidates.push(String(diagram.imageId));
  }
  if (diagram.name) {
    candidates.push(normalizeAssetKey(diagram.name));
  }

  for (const key of candidates) {
    if (!key) {
      continue;
    }
    const hit = byKey.get(key);
    if (hit) {
      return hit;
    }
  }
  return undefined;
}
