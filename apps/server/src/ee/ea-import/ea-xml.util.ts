import { XMLParser } from 'fast-xml-parser';
import * as iconv from 'iconv-lite';

/**
 * Shared, dependency-free helpers for the Enterprise Architect XML parsers
 * (XMI and BPMN). Nodes follow the shape produced by `fast-xml-parser` with
 * `preserveOrder: true`: a single tag key plus an optional `:@` attribute map.
 */

export type FxpNode = Record<string, any>;

const XML_DECL_ENCODING = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i;

/**
 * Decode a buffer using the encoding named in its XML declaration, falling
 * back to UTF-8. `latin1` alone is wrong for `windows-1252` at 0x80-0x9F, so
 * `iconv-lite` is used for the real code page.
 */
export function decodeBuffer(buffer: Buffer): string {
  const head = buffer.slice(0, 256).toString('latin1');
  const match = XML_DECL_ENCODING.exec(head);
  const encoding = match && match[1] ? match[1].trim().toLowerCase() : 'utf-8';
  try {
    return iconv.decode(buffer, encoding);
  } catch {
    return buffer.toString('utf-8');
  }
}

/**
 * Decode and parse an EA XML export. DTD / entity declarations are refused
 * outright (no entity-expansion surface); `label` names the format in errors.
 */
export function parseXmlDocument(buffer: Buffer, label: string): FxpNode[] {
  const text = decodeBuffer(buffer);
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) {
    throw new Error(
      `${label} input contains a DTD or entity declaration; refusing to parse`,
    );
  }
  return createXmlParser().parse(text) as FxpNode[];
}

/** Hardened parser options shared by both formats. */
export function createXmlParser(): XMLParser {
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,
    trimValues: true,
    parseTagValue: false,
    parseAttributeValue: false,
    htmlEntities: true,
    processEntities: true,
    allowBooleanAttributes: true,
  });
}

export function tagOf(node: FxpNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ':@') {
      return key;
    }
  }
  return undefined;
}

/** Tag with any namespace prefix removed (`bpmn:process` -> `process`). */
export function localTagOf(node: FxpNode): string | undefined {
  const tag = tagOf(node);
  if (!tag || tag === '#text') {
    return tag;
  }
  const separator = tag.indexOf(':');
  return separator >= 0 ? tag.slice(separator + 1) : tag;
}

export function childrenOf(node: FxpNode): FxpNode[] {
  const tag = tagOf(node);
  if (!tag || tag === '#text') {
    return [];
  }
  const value = node[tag];
  return Array.isArray(value) ? value : [];
}

export function attributeOf(node: FxpNode, name: string): string | undefined {
  const attrs = node[':@'];
  if (!attrs) {
    return undefined;
  }
  const value = attrs['@_' + name];
  return value === undefined || value === null ? undefined : String(value);
}

export function textOf(node: FxpNode): string {
  let text = '';
  for (const child of childrenOf(node)) {
    if (tagOf(child) === '#text') {
      const value = child['#text'];
      if (typeof value === 'string') {
        text += value;
      } else if (value !== undefined && value !== null) {
        text += String(value);
      }
    }
  }
  return text;
}

export function findChildren(nodes: FxpNode[], tag: string): FxpNode[] {
  return nodes.filter((node) => tagOf(node) === tag);
}

export function firstChild(nodes: FxpNode[], tag: string): FxpNode | undefined {
  return nodes.find((node) => tagOf(node) === tag);
}

export function findChildrenByLocal(
  nodes: FxpNode[],
  local: string,
): FxpNode[] {
  return nodes.filter((node) => localTagOf(node) === local);
}

export function firstChildByLocal(
  nodes: FxpNode[],
  local: string,
): FxpNode | undefined {
  return nodes.find((node) => localTagOf(node) === local);
}

/** Preserve diacritics; only normalize Unicode composition. */
export function normalizeName(name: string): string {
  return name.normalize('NFC');
}

export function parseNumeric(value: string | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Leading number of a name (`3. Giao diện` -> 3), used as sort order. */
export function leadingInteger(name: string): number | undefined {
  const match = /^\s*(\d+)/.exec(name);
  return match ? parseNumeric(match[1]) : undefined;
}
