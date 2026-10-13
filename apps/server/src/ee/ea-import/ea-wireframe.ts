import { EaWireframeShape } from './types/ea-import.types';

/**
 * EA "Wireframing" controls (WireframeButton, WireframeTextField, ...) ->
 * an editable draw.io diagram stored as `diagram.drawio.svg`: a plain SVG
 * preview plus the mxGraph model in the `content` attribute, the same file
 * shape the editor's draw.io node saves. Pure: no Nest / DB dependencies.
 *
 * Wireframes that are only a pasted screenshot never get here; their image
 * is imported 1:1 as a normal image attachment.
 */

const MARGIN = 10;
const DEFAULT_FONT_SIZE = 11;
const BROWSER_BAR = 40;

interface ShapeLook {
  /** draw.io cell style. */
  style: string;
  /** Preview box; `null` = text only. */
  fill: string | null;
  stroke: string;
  radius: number;
  textColor: string;
  align: 'start' | 'middle';
}

const TEXT: ShapeLook = {
  style:
    'text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;whiteSpace=wrap;',
  fill: null,
  stroke: 'none',
  radius: 0,
  textColor: '#000000',
  align: 'start',
};

const LOOKS: Record<string, ShapeLook> = {
  WireframeWebsite: {
    style:
      'strokeWidth=1;shadow=0;dashed=0;align=center;html=1;shape=mxgraph.mockup.containers.browserWindow;rSize=0;strokeColor=#666666;strokeColor2=#008cff;strokeColor3=#c4c4c4;mainText=,;recursiveResize=0;',
    fill: '#ffffff',
    stroke: '#666666',
    radius: 0,
    textColor: '#666666',
    align: 'start',
  },
  WireframeButton: {
    style:
      'rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;',
    fill: '#dae8fc',
    stroke: '#6c8ebf',
    radius: 6,
    textColor: '#000000',
    align: 'middle',
  },
  WireframeTextField: {
    style:
      'rounded=0;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#999999;align=left;spacingLeft=6;fontColor=#666666;',
    fill: '#ffffff',
    stroke: '#999999',
    radius: 0,
    textColor: '#666666',
    align: 'start',
  },
  WireframeLabel: TEXT,
  WireframeTextBlock: TEXT,
};

/** Unknown controls: dashed box with their text, so nothing silently vanishes. */
const FALLBACK: ShapeLook = {
  style:
    'rounded=0;whiteSpace=wrap;html=1;dashed=1;fillColor=none;strokeColor=#999999;',
  fill: 'none',
  stroke: '#999999',
  radius: 0,
  textColor: '#333333',
  align: 'middle',
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EaWireframeControl {
  kind: string;
  text: string;
}

/**
 * A model element is a Wireframing control when its stereotype is one of the
 * `Wireframe*` toolbox stereotypes. Text blocks keep their text in the notes,
 * other controls in the name. Shared by the native, XMI 1.1 and XMI 2.1 parsers.
 */
export function wireframeControl(
  stereotype: string | undefined,
  name: string | undefined,
  notes: string | undefined,
): EaWireframeControl | undefined {
  if (!stereotype?.startsWith('Wireframe')) {
    return undefined;
  }
  const text = decodeNumericEntities(name || notes || '').normalize('NFC');
  return { kind: stereotype, text };
}

/** Place a control on a diagram; null when the diagram object has no usable box. */
export function toWireframeShape(
  control: EaWireframeControl,
  geometry: string,
  style: string,
): EaWireframeShape | null {
  const box = parseEaGeometry(geometry);
  return box ? { ...control, ...box, ...parseEaFont(style) } : null;
}

/** EA double-escapes some text (`B&amp;#193;O`); fold leftover numeric entities. */
function decodeNumericEntities(value: string): string {
  return value.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code: string) =>
    String.fromCodePoint(
      code[0].toLowerCase() === 'x'
        ? parseInt(code.slice(1), 16)
        : parseInt(code, 10),
    ),
  );
}

/** `Left=1;Top=2;Right=3;Bottom=4;` -> box (EA flips Top's sign in some formats). */
function parseEaGeometry(
  geometry: string,
): { x: number; y: number; width: number; height: number } | null {
  const read = (key: string) => {
    const m = new RegExp(`(?:^|;)${key}=(-?\\d+)`).exec(geometry);
    return m ? Math.abs(parseInt(m[1], 10)) : null;
  };
  const left = read('Left');
  const top = read('Top');
  const right = read('Right');
  const bottom = read('Bottom');
  if (left === null || top === null || right === null || bottom === null) {
    return null;
  }
  const width = Math.abs(right - left);
  const height = Math.abs(bottom - top);
  if (width === 0 || height === 0) {
    return null;
  }
  return { x: Math.min(left, right), y: Math.min(top, bottom), width, height };
}

/** Diagram-object style `fontsz=120;bold=1;` -> 12pt bold. */
function parseEaFont(style: string): {
  fontSize?: number;
  bold?: boolean;
} {
  const size = /(?:^|;)fontsz=(\d+)/.exec(style);
  const font: { fontSize?: number; bold?: boolean } = {};
  if (size && parseInt(size[1], 10) > 0) {
    font.fontSize = Math.round(parseInt(size[1], 10) / 10);
  }
  if (/(?:^|;)bold=1/.test(style)) {
    font.bold = true;
  }
  return font;
}

/**
 * Build the `diagram.drawio.svg` file content. Shapes are drawn largest
 * first so containers sit behind their controls. ponytail: area-based
 * z-order, switch to EA's diagram sequence if overlapping peers ever misorder.
 */
export function buildWireframeDrawioSvg(shapes: EaWireframeShape[]): string {
  const minX = Math.min(...shapes.map((s) => s.x));
  const minY = Math.min(...shapes.map((s) => s.y));
  const ordered = [...shapes]
    .map((s) => ({ ...s, x: s.x - minX + MARGIN, y: s.y - minY + MARGIN }))
    .sort((a, b) => b.width * b.height - a.width * a.height);
  const width = Math.max(...ordered.map((s) => s.x + s.width)) + MARGIN;
  const height = Math.max(...ordered.map((s) => s.y + s.height)) + MARGIN;

  let cells = '<mxCell id="0"/><mxCell id="1" parent="0"/>';
  let preview = '';
  ordered.forEach((shape, index) => {
    const look = LOOKS[shape.kind] ?? FALLBACK;
    const fontSize = shape.fontSize ?? DEFAULT_FONT_SIZE;
    const text = shape.text.replace(/\s+/g, ' ').trim();
    const style =
      look.style + `fontSize=${fontSize};` + (shape.bold ? 'fontStyle=1;' : '');
    cells +=
      `<mxCell id="w${index + 2}" value="${escapeXml(text)}" style="${escapeXml(style)}" vertex="1" parent="1">` +
      `<mxGeometry x="${shape.x}" y="${shape.y}" width="${shape.width}" height="${shape.height}" as="geometry"/></mxCell>`;

    const { x, y, width: w, height: h } = shape;
    if (look.fill !== null) {
      preview += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${look.radius}" fill="${look.fill}" stroke="${look.stroke}"/>`;
    }
    let textY = y + h / 2;
    if (shape.kind === 'WireframeWebsite') {
      const bar = Math.min(BROWSER_BAR, h);
      preview += `<rect x="${x}" y="${y}" width="${w}" height="${bar}" fill="#f0f0f0" stroke="${look.stroke}"/>`;
      textY = y + bar / 2;
    }
    if (text) {
      const textX = look.align === 'middle' ? x + w / 2 : x + 6;
      preview +=
        `<text x="${textX}" y="${textY}" font-family="Helvetica, Arial, sans-serif" font-size="${fontSize}" ` +
        `${shape.bold ? 'font-weight="bold" ' : ''}fill="${look.textColor}" text-anchor="${look.align}" dominant-baseline="middle">${escapeXml(text)}</text>`;
    }
  });

  const model = `<mxGraphModel><root>${cells}</root></mxGraphModel>`;
  const mxfile = `<mxfile host="docmost"><diagram id="wireframe" name="Page-1">${model}</diagram></mxfile>`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" content="${escapeXml(mxfile)}">` +
    `<rect width="100%" height="100%" fill="#ffffff"/>${preview}</svg>`
  );
}

/**
 * The editor's draw.io node with the same attributes the draw.io macro sets
 * after a save (`drawio-menu.tsx`): src, title = file name, size, attachment.
 */
export function drawioNodeHtml(opts: {
  src: string;
  attachmentId: string;
  fileName: string;
  size: number;
}): string {
  return (
    `<div data-type="drawio" data-src="${escapeXml(opts.src)}" data-title="${escapeXml(opts.fileName)}" ` +
    `data-size="${opts.size}" data-attachment-id="${escapeXml(opts.attachmentId)}" data-align="center"></div>`
  );
}
