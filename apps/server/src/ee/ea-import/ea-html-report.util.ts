import * as path from 'path';
import { load } from 'cheerio';

/**
 * Pure title helpers for the EA HTML-report importer. Kept free of Nest / DB /
 * import-pipeline dependencies so they stay fast to unit test.
 */

/**
 * The report's container title is the `<title>` of its index page when
 * present, otherwise the supplied fallback (usually the archive name).
 */
export function pickReportTitle(
  html: string | undefined,
  fallback: string,
): string {
  if (html) {
    try {
      const title = load(html)('title').first().text().trim();
      if (title) {
        return title;
      }
    } catch {
      // fall through to the fallback
    }
  }
  return fallback;
}

/**
 * A page title is its first `<h1>`, else its `<title>`, else the supplied
 * fallback (usually the filename stem).
 */
export function pickPageTitle(
  html: string | undefined,
  fallback: string,
): string {
  if (html) {
    try {
      const $ = load(html);
      const heading = $('h1').first().text().trim();
      if (heading) {
        return heading;
      }
      const title = $('title').first().text().trim();
      if (title) {
        return title;
      }
    } catch {
      // fall through to the fallback
    }
  }
  return fallback;
}

/** Filename stem (no extension) of an archive-relative path. */
export function fileStem(relativePath: string): string {
  const base = path.basename(relativePath);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}
