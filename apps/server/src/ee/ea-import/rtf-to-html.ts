/**
 * Hand-rolled RTF -> HTML converter for the subset emitted by Enterprise
 * Architect "Model Document" payloads. Pure (no Nest / DB dependencies).
 *
 * The converter intentionally emits only a small whitelist of tags and
 * HTML-escapes every text run: downstream `processHTML`/`normalizeImportHtml`
 * does NOT sanitize, so this layer is the security boundary.
 */

import { EaRtfImage } from './types/ea-import.types';

interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  raw?: boolean;
}

interface Paragraph {
  runs: TextRun[];
  plain: string;
  allBold: boolean;
}

interface TableState {
  rows: string[][];
  row: string[];
}

/** Destinations whose entire group must be dropped. */
const DROP_DESTINATIONS = new Set<string>([
  'fonttbl',
  'colortbl',
  'stylesheet',
  'listtable',
  'listoverridetable',
  'revtbl',
  'rsidtbl',
  'filetbl',
  'pict',
  'object',
  'htmltag',
  'shppict',
  'nonshppict',
  'themedata',
  'colorschememapping',
  'latentstyles',
  'datastore',
  'generator',
  'info',
  'xmlnstbl',
]);

/** cp1252 mapping for 0x80-0x9F (undefined slots fall back to the byte itself). */
const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac,
  0x82: 0x201a,
  0x83: 0x0192,
  0x84: 0x201e,
  0x85: 0x2026,
  0x86: 0x2020,
  0x87: 0x2021,
  0x88: 0x02c6,
  0x89: 0x2030,
  0x8a: 0x0160,
  0x8b: 0x2039,
  0x8c: 0x0152,
  0x8e: 0x017d,
  0x91: 0x2018,
  0x92: 0x2019,
  0x93: 0x201c,
  0x94: 0x201d,
  0x95: 0x2022,
  0x96: 0x2013,
  0x97: 0x2014,
  0x98: 0x02dc,
  0x99: 0x2122,
  0x9a: 0x0161,
  0x9b: 0x203a,
  0x9c: 0x0153,
  0x9e: 0x017e,
  0x9f: 0x0178,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Char-code constants + predicates for the hot scanning loops. Comparing
 * `charCodeAt` integers is markedly faster than indexing single-char strings
 * (which allocates) or running a regex `.test()` per character.
 */
const CH_BACKSLASH = 92;
const CH_OPEN_BRACE = 123;
const CH_CLOSE_BRACE = 125;
const CH_QUOTE = 39;
const CH_STAR = 42;
const CH_DASH = 45;
const CH_SPACE = 32;
const CH_TAB = 9;
const CH_CR = 13;
const CH_LF = 10;

function isAsciiLetter(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isHexDigit(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 70) ||
    (code >= 97 && code <= 102)
  );
}

function isWhitespace(code: number): boolean {
  return code === CH_SPACE || code === CH_CR || code === CH_LF || code === CH_TAB;
}

function decodeHexByte(hex: string): string {
  const byte = parseInt(hex, 16);
  if (!Number.isFinite(byte) || byte < 0 || byte > 0xff) {
    return '';
  }
  const mapped = byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte] : undefined;
  return String.fromCharCode(mapped === undefined ? byte : mapped);
}

function newParagraph(): Paragraph {
  return { runs: [], plain: '', allBold: true };
}

function renderRuns(runs: TextRun[], stripBold: boolean): string {
  let html = '';
  for (const run of runs) {
    if (run.raw) {
      html += run.text;
      continue;
    }
    let piece = escapeHtml(run.text);
    if (run.underline) {
      piece = `<u>${piece}</u>`;
    }
    if (run.italic) {
      piece = `<em>${piece}</em>`;
    }
    if (run.bold && !stripBold) {
      piece = `<strong>${piece}</strong>`;
    }
    html += piece;
  }
  return html;
}

/** Cap for a single decoded RTF `\pict` image (8 MB). */
const MAX_RTF_IMAGE_BYTES = 8 * 1024 * 1024;

const RTF_IMAGE_BLIP_MIME: Record<string, string> = {
  pngblip: 'image/png',
  jpegblip: 'image/jpeg',
};

/** Blip types the converter deliberately drops (cannot be embedded as-is). */
const RTF_IMAGE_UNSUPPORTED_BLIPS = new Set<string>([
  'wmetafile',
  'emfblip',
  'macpict',
]);

/** Wrapping groups that contain a `\pict` (shape + hidden non-shape variant). */
const RTF_IMAGE_WRAPPER_DESTINATIONS = new Set<string>([
  'shppict',
  'nonshppict',
]);

/**
 * Stable token a `\pict` group is replaced with, e.g.
 * `EARTFIMGPLACEHOLDER0Z`. Callers replace it with uploaded image HTML.
 */
export function eaRtfImagePlaceholder(index: number): string {
  return `EARTFIMGPLACEHOLDER${index}Z`;
}

/** Destination control word of the group opening at `openIndex`, if any. */
function readGroupDestination(rtf: string, openIndex: number): string | null {
  const length = rtf.length;
  let i = openIndex + 1;
  if (rtf.charCodeAt(i) !== CH_BACKSLASH) {
    return null;
  }
  i += 1;
  if (rtf.charCodeAt(i) === CH_STAR) {
    i += 1;
    while (i < length && isWhitespace(rtf.charCodeAt(i))) {
      i += 1;
    }
    if (rtf.charCodeAt(i) !== CH_BACKSLASH) {
      return null;
    }
    i += 1;
  }
  const start = i;
  while (i < length && isAsciiLetter(rtf.charCodeAt(i))) {
    i += 1;
  }
  return i === start ? null : rtf.slice(start, i);
}

/** Index of the `}` matching the group opened at `openIndex`, or -1. */
function findGroupEnd(rtf: string, openIndex: number): number {
  const length = rtf.length;
  let depth = 0;
  for (let i = openIndex; i < length; i += 1) {
    const code = rtf.charCodeAt(i);
    if (code === CH_BACKSLASH) {
      i += 1;
      continue;
    }
    if (code === CH_OPEN_BRACE) {
      depth += 1;
    } else if (code === CH_CLOSE_BRACE) {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

/** Read the control word beginning at a backslash. */
function readControlWord(
  rtf: string,
  backslashIndex: number,
  limit: number,
): { word: string; next: number } {
  let i = backslashIndex + 1;
  const first = rtf.charCodeAt(i);
  if (first === CH_STAR) {
    return { word: '', next: Math.min(i + 1, limit) };
  }
  if (first === CH_QUOTE) {
    return { word: '', next: Math.min(i + 3, limit) };
  }
  const start = i;
  while (i < limit && isAsciiLetter(rtf.charCodeAt(i))) {
    i += 1;
  }
  const word = rtf.slice(start, i);
  if (word.length === 0) {
    return { word: '', next: Math.min(i + 1, limit) };
  }
  const paramStart = rtf.charCodeAt(i);
  if (paramStart === CH_DASH || isDigit(paramStart)) {
    if (paramStart === CH_DASH) {
      i += 1;
    }
    while (i < limit && isDigit(rtf.charCodeAt(i))) {
      i += 1;
    }
  }
  if (rtf.charCodeAt(i) === CH_SPACE) {
    i += 1;
  }
  return { word, next: i };
}

/** Collect hex digits from `from`..`limit`, skipping controls, params, groups. */
function collectHexDigits(rtf: string, from: number, limit: number): string {
  let i = from;
  let hex = '';
  while (i < limit) {
    const code = rtf.charCodeAt(i);
    if (code === CH_BACKSLASH) {
      i = readControlWord(rtf, i, limit).next;
      continue;
    }
    if (code === CH_OPEN_BRACE) {
      const end = findGroupEnd(rtf, i);
      i = end < 0 ? limit : end + 1;
      continue;
    }
    if (isHexDigit(code)) {
      hex += rtf[i];
    }
    i += 1;
  }
  return hex;
}

/** Decode the image held by a `\pict` group; null when absent/unsupported. */
function extractPictImage(
  rtf: string,
  openIndex: number,
  closeIndex: number,
): EaRtfImage | null {
  let mimeType: string | null = null;
  let hexStart = -1;
  let i = openIndex + 1;
  while (i < closeIndex) {
    const ch = rtf[i];
    if (ch === '\\') {
      const { word, next } = readControlWord(rtf, i, closeIndex);
      i = next;
      if (word === 'pngblip' || word === 'jpegblip') {
        mimeType = RTF_IMAGE_BLIP_MIME[word];
        hexStart = i;
        break;
      }
      if (RTF_IMAGE_UNSUPPORTED_BLIPS.has(word)) {
        return null;
      }
      continue;
    }
    if (ch === '{') {
      const end = findGroupEnd(rtf, i);
      i = end < 0 ? closeIndex : end + 1;
      continue;
    }
    i += 1;
  }
  if (!mimeType || hexStart < 0) {
    return null;
  }
  const hex = collectHexDigits(rtf, hexStart, closeIndex);
  if (hex.length < 2 || hex.length % 2 !== 0) {
    return null;
  }
  if (hex.length / 2 > MAX_RTF_IMAGE_BYTES) {
    return null;
  }
  try {
    const buffer = Buffer.from(hex, 'hex');
    if (buffer.length === 0 || buffer.length > MAX_RTF_IMAGE_BYTES) {
      return null;
    }
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

/** Span of the first `\pict` group inside `from`..`to`, or null. */
function findPictGroup(
  rtf: string,
  from: number,
  to: number,
): { start: number; end: number } | null {
  let i = from;
  while (i < to) {
    const code = rtf.charCodeAt(i);
    if (code === CH_BACKSLASH) {
      i = readControlWord(rtf, i, to).next;
      continue;
    }
    if (code === CH_OPEN_BRACE) {
      if (readGroupDestination(rtf, i) === 'pict') {
        const end = findGroupEnd(rtf, i);
        return { start: i, end: end < 0 ? to : end };
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return null;
}

/**
 * Pre-pass run before the tokenizer: locate every `\pict` group, decode
 * supported `\pngblip`/`\jpegblip` hex payloads onto `imageSink` (when given)
 * and replace the group (or its `shppict`/`nonshppict` wrapper) with a stable
 * placeholder. Malformed or unsupported pictures are dropped, never thrown.
 *
 * Copies untouched spans in bulk (a single `indexOf`/`slice` per group) so the
 * common no-image document is returned unchanged without a full copy.
 */
function stripPictGroups(rtf: string, imageSink?: EaRtfImage[]): string {
  if (rtf.indexOf('pict') === -1) {
    return rtf;
  }
  const length = rtf.length;
  let out = '';
  let last = 0;
  let i = 0;
  let imageIndex = 0;
  while (i < length) {
    const brace = rtf.indexOf('{', i);
    if (brace < 0) {
      break;
    }
    const destination = readGroupDestination(rtf, brace);
    const isPict = destination === 'pict';
    const isWrapper =
      destination !== null &&
      RTF_IMAGE_WRAPPER_DESTINATIONS.has(destination);
    if (isPict || isWrapper) {
      const end = findGroupEnd(rtf, brace);
      if (end >= 0) {
        let image: EaRtfImage | null = null;
        if (isPict) {
          image = extractPictImage(rtf, brace, end);
        } else {
          const pict = findPictGroup(rtf, brace + 1, end);
          if (pict) {
            image = extractPictImage(rtf, pict.start, pict.end);
          }
        }
        out += rtf.slice(last, brace);
        if (image && imageSink) {
          imageSink.push(image);
          out += eaRtfImagePlaceholder(imageIndex);
          imageIndex += 1;
        }
        i = end + 1;
        last = i;
        continue;
      }
    }
    i = brace + 1;
  }
  out += rtf.slice(last);
  return out;
}

export function rtfToHtml(rtf: string, imageSink?: EaRtfImage[]): string {
  try {
    if (typeof rtf !== 'string') {
      return '<p></p>';
    }
    return convert(stripPictGroups(rtf, imageSink));
  } catch {
    return '<p></p>';
  }
}

function convert(rtf: string): string {
  if (typeof rtf !== 'string' || rtf.length === 0 || !rtf.includes('\\rtf')) {
    return '<p></p>';
  }

  const out: string[] = [];
  const length = rtf.length;
  let i = 0;

  let depth = 0;
  let skipLevel = -1;
  let pendingIgnorable = false;

  let bold = false;
  let italic = false;
  let underline = false;

  let paragraph = newParagraph();
  let table: TableState | null = null;
  let inCell = false;

  const addText = (text: string): void => {
    if (!text) {
      return;
    }
    if (!bold && /\S/.test(text)) {
      paragraph.allBold = false;
    }
    paragraph.plain += text;
    const last = paragraph.runs[paragraph.runs.length - 1];
    if (
      last &&
      !last.raw &&
      last.bold === bold &&
      last.italic === italic &&
      last.underline === underline
    ) {
      last.text += text;
    } else {
      paragraph.runs.push({ text, bold, italic, underline });
    }
  };

  const pushRaw = (raw: string): void => {
    paragraph.runs.push({
      text: raw,
      bold,
      italic,
      underline,
      raw: true,
    });
  };

  const flushParagraph = (): void => {
    const { runs, plain, allBold } = paragraph;
    paragraph = newParagraph();
    const hasContent = plain.trim() !== '' || runs.some((r) => r.raw);
    if (!hasContent) {
      return;
    }
    const heading = /^(\d+(?:\.\d+)*\.?)\s/.exec(plain);
    if (allBold && heading) {
      const dots = (heading[1].match(/\./g) ?? []).length;
      const level = Math.min(Math.max(dots, 1), 6);
      out.push(`<h${level}>${renderRuns(runs, true)}</h${level}>`);
    } else {
      out.push(`<p>${renderRuns(runs, false)}</p>`);
    }
  };

  const closeTable = (): void => {
    if (table && table.rows.length > 0) {
      let html = '<table>';
      for (const row of table.rows) {
        html += '<tr>';
        for (const cell of row) {
          html += `<td>${cell}</td>`;
        }
        html += '</tr>';
      }
      html += '</table>';
      out.push(html);
    }
    table = null;
    inCell = false;
  };

  const startSkip = (): void => {
    if (depth > 0) {
      skipLevel = depth;
    }
  };

  const resetCharFormat = (): void => {
    bold = false;
    italic = false;
    underline = false;
  };

  const endCell = (): void => {
    if (!table) {
      return;
    }
    table.row.push(renderRuns(paragraph.runs, false));
    paragraph = newParagraph();
  };

  const endRow = (): void => {
    if (!table) {
      return;
    }
    if (paragraph.runs.length > 0) {
      table.row.push(renderRuns(paragraph.runs, false));
      paragraph = newParagraph();
    }
    table.rows.push(table.row);
    table.row = [];
    inCell = false;
  };

  const handleControlWord = (word: string, param: number | undefined): void => {
    if (pendingIgnorable) {
      pendingIgnorable = false;
      startSkip();
      return;
    }
    if (DROP_DESTINATIONS.has(word)) {
      startSkip();
      return;
    }

    switch (word) {
      case 'par':
      case 'line':
        if (word === 'line') {
          pushRaw('<br/>');
          break;
        }
        if (table) {
          if (inCell) {
            pushRaw('<br/>');
          } else {
            closeTable();
            flushParagraph();
          }
        } else {
          flushParagraph();
        }
        break;
      case 'pard':
      case 'plain':
        resetCharFormat();
        break;
      case 'b':
        bold = param === undefined ? true : param !== 0;
        break;
      case 'i':
        italic = param === undefined ? true : param !== 0;
        break;
      case 'ul':
        underline = param === undefined ? true : param !== 0;
        break;
      case 'ulnone':
        underline = false;
        break;
      case 'tab':
        addText('\t');
        break;
      case 'u': {
        if (param === undefined) {
          break;
        }
        const code = param < 0 ? param + 65536 : param;
        addText(String.fromCharCode(code));
        let cursor = i;
        while (cursor < length) {
          const c = rtf.charCodeAt(cursor);
          if (c !== CH_CR && c !== CH_LF) {
            break;
          }
          cursor += 1;
        }
        if (
          cursor + 1 < length &&
          rtf.charCodeAt(cursor) === CH_BACKSLASH &&
          rtf.charCodeAt(cursor + 1) === CH_QUOTE
        ) {
          i = Math.min(cursor + 4, length);
        }
        break;
      }
      case 'uc':
        // fallback byte count; the converter only ever skips a `\'hh` token.
        break;
      case 'intbl':
        inCell = true;
        break;
      case 'trowd':
        if (!table) {
          flushParagraph();
          table = { rows: [], row: [] };
        }
        break;
      case 'cell':
        endCell();
        break;
      case 'row':
        endRow();
        break;
      case 'cellx':
      case 'trgaph':
      case 'trleft':
      case 'trrh':
      case 'tblind':
      case 'tblindtype':
      case 'trpaddl':
      case 'trpaddr':
      case 'trpaddt':
      case 'trpaddb':
      case 'trpaddfl':
      case 'trpaddfr':
      case 'trpaddft':
      case 'trpaddfb':
      case 'clvertalt':
      case 'clvertalc':
      case 'clvertalb':
      case 'clbrdrt':
      case 'clbrdrb':
      case 'clbrdrl':
      case 'clbrdrr':
      case 'clcbpat':
      case 'clpadt':
      case 'clpadft':
      case 'clpadr':
      case 'clpadfr':
      case 'clpadl':
      case 'clpadfl':
      case 'clpadb':
      case 'clpadfb':
      case 'lastrow':
      case 'trhdr':
      case 'ltrrow':
      case 'ltrpar':
      case 'ql':
      case 'qc':
      case 'qj':
      case 'qr':
      case 'widctlpar':
      case 'li':
      case 'ri':
      case 'fi':
      case 'sa':
      case 'sb':
      case 'sl':
      case 'slmult':
      case 'f':
      case 'fs':
      case 'cf':
      case 'cb':
      case 'chcbpat':
      case 'lang':
      case 'langfe':
      case 'langnp':
      case 'deflang':
      case 'deflangfe':
      case 'hich':
      case 'dbch':
      case 'loch':
      case 'ltrch':
      case 'rtlch':
      case 's':
      case 'sect':
      case 'sectd':
      case 'sbknone':
      case 'sp':
      case 'rtlpar':
      case 'keep':
      case 'nowidctlpar':
      case 'noproof':
      case 'brdrnone':
      case 'brdrs':
      case 'brdrw':
      case 'brdrcf':
      case 'green':
      case 'dy':
      case 'ssparaaux0':
        // Formatting / layout controls: intentionally ignored.
        break;
      default:
        // Unknown control word: skipped.
        break;
    }
  };

  const handleControlSymbol = (symbol: string): void => {
    switch (symbol) {
      case '\\':
        addText('\\');
        break;
      case '{':
        addText('{');
        break;
      case '}':
        addText('}');
        break;
      case '~':
        addText('\u00a0');
        break;
      case '-':
        // Optional hyphen: emitted as nothing.
        break;
      case '*':
        pendingIgnorable = true;
        break;
      default:
        break;
    }
  };

  while (i < length) {
    if (skipLevel >= 0) {
      const code = rtf.charCodeAt(i);
      if (code === CH_OPEN_BRACE) {
        depth += 1;
      } else if (code === CH_CLOSE_BRACE) {
        depth -= 1;
        if (depth < skipLevel) {
          skipLevel = -1;
        }
      }
      i += 1;
      continue;
    }

    const code = rtf.charCodeAt(i);

    if (code === CH_OPEN_BRACE) {
      depth += 1;
      i += 1;
      continue;
    }
    if (code === CH_CLOSE_BRACE) {
      depth -= 1;
      i += 1;
      continue;
    }
    if (code === CH_BACKSLASH) {
      i += 1;
      if (i >= length) {
        break;
      }
      const nextCode = rtf.charCodeAt(i);
      if (isAsciiLetter(nextCode)) {
        let cursor = i;
        while (cursor < length && isAsciiLetter(rtf.charCodeAt(cursor))) {
          cursor += 1;
        }
        const word = rtf.slice(i, cursor);
        let param: number | undefined;
        const paramCode = rtf.charCodeAt(cursor);
        if (paramCode === CH_DASH || isDigit(paramCode)) {
          const numberStart = cursor;
          if (paramCode === CH_DASH) {
            cursor += 1;
          }
          while (cursor < length && isDigit(rtf.charCodeAt(cursor))) {
            cursor += 1;
          }
          const parsed = parseInt(rtf.slice(numberStart, cursor), 10);
          param = Number.isFinite(parsed) ? parsed : undefined;
        }
        if (rtf.charCodeAt(cursor) === CH_SPACE) {
          cursor += 1;
        }
        i = cursor;
        handleControlWord(word, param);
      } else if (nextCode === CH_QUOTE) {
        const hex = rtf.slice(i + 1, i + 3);
        i += 3;
        addText(decodeHexByte(hex));
      } else {
        i += 1;
        handleControlSymbol(rtf[i - 1]);
      }
      continue;
    }
    if (code === CH_CR || code === CH_LF) {
      i += 1;
      continue;
    }

    let cursor = i;
    while (cursor < length) {
      const c = rtf.charCodeAt(cursor);
      if (
        c === CH_BACKSLASH ||
        c === CH_OPEN_BRACE ||
        c === CH_CLOSE_BRACE ||
        c === CH_CR ||
        c === CH_LF
      ) {
        break;
      }
      cursor += 1;
    }
    if (cursor === i) {
      i += 1;
    } else {
      addText(rtf.slice(i, cursor));
      i = cursor;
    }
  }

  closeTable();
  flushParagraph();
  return out.join('');
}
