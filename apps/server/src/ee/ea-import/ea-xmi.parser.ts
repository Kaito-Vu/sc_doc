import {
  EaActivity,
  EaDiagram,
  EaDocumentPayload,
  EaFlowEdge,
  EaImageAsset,
  EaLane,
  EaPackageNode,
  EaParseResult,
  EaParseWarning,
} from './types/ea-import.types';
import { normalizeAssetKey, sniffImageMime } from './ea-asset.util';
import {
  FxpNode,
  attributeOf,
  childrenOf,
  createXmlParser,
  decodeBuffer,
  findChildren,
  firstChild,
  normalizeName,
  tagOf,
  textOf,
} from './ea-xml.util';

/**
 * Pure Enterprise Architect XMI -> package tree parser. No Nest / DB
 * dependencies. Single bad elements are reported as warnings and skipped;
 * only structural problems (DTD/entity declarations, unparseable XML) throw.
 */

const NESTED_PACKAGE_SKIP = new Set(['UML:Package', 'UML:Collaboration']);

function taggedValues(element: FxpNode): Map<string, string> {
  const map = new Map<string, string>();
  const container = firstChild(childrenOf(element), 'UML:ModelElement.taggedValue');
  if (!container) {
    return map;
  }
  for (const tagged of findChildren(childrenOf(container), 'UML:TaggedValue')) {
    const tag = attributeOf(tagged, 'tag');
    const value = attributeOf(tagged, 'value');
    if (tag !== undefined && value !== undefined && !map.has(tag)) {
      map.set(tag, value);
    }
  }
  return map;
}

function stereotypeOf(element: FxpNode): string | undefined {
  const container = firstChild(childrenOf(element), 'UML:ModelElement.stereotype');
  if (!container) {
    return undefined;
  }
  const stereo = firstChild(childrenOf(container), 'UML:Stereotype');
  return stereo ? attributeOf(stereo, 'name') : undefined;
}

function modelDocumentOf(element: FxpNode): string | undefined {
  const container = firstChild(childrenOf(element), 'UML:ModelElement.taggedValue');
  if (!container) {
    return undefined;
  }
  for (const tagged of findChildren(childrenOf(container), 'UML:TaggedValue')) {
    if (attributeOf(tagged, 'tag') === 'modeldocument') {
      const base64 = textOf(tagged).trim();
      if (base64) {
        return base64;
      }
    }
  }
  return undefined;
}

function parseNumeric(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function leadingInteger(name: string): number | undefined {
  const match = /^\s*(\d+)/.exec(name);
  if (!match) {
    return undefined;
  }
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function orderOf(name: string, tagged: Map<string, string>, fallback: number): number {
  return leadingInteger(name) ?? parseNumeric(tagged.get('tpos')) ?? fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Collect the element node itself plus all descendants, without descending
 * into selected subtree tags (nested packages / index collaborations).
 */
function collectElements(nodes: FxpNode[], skip: Set<string>, out: FxpNode[]): void {
  for (const node of nodes) {
    const tag = tagOf(node);
    if (!tag || tag === '#text') {
      continue;
    }
    out.push(node);
    if (skip.has(tag)) {
      continue;
    }
    collectElements(childrenOf(node), skip, out);
  }
}

function extractDocuments(
  contentNodes: FxpNode[],
  node: EaPackageNode,
  warnings: EaParseWarning[],
): void {
  const elements: FxpNode[] = [];
  collectElements(contentNodes, NESTED_PACKAGE_SKIP, elements);
  let index = 0;
  for (const element of elements) {
    try {
      const base64 = modelDocumentOf(element);
      if (!base64) {
        continue;
      }
      const tagged = taggedValues(element);
      const document: EaDocumentPayload = {
        ownerId: node.id,
        ownerName: normalizeName(attributeOf(element, 'name') ?? ''),
        order: parseNumeric(tagged.get('tpos')) ?? index,
        base64,
      };
      node.documents.push(document);
      index += 1;
    } catch (error) {
      warnings.push({
        page: node.name,
        reason: `Failed to read document payload: ${errorMessage(error)}`,
      });
    }
  }
  node.documents.sort((a, b) => a.order - b.order);
}

function extractFlow(contentNodes: FxpNode[], node: EaPackageNode): void {
  const elements: FxpNode[] = [];
  collectElements(contentNodes, NESTED_PACKAGE_SKIP, elements);

  const laneById = new Map<string, EaLane>();

  for (const element of elements) {
    if (tagOf(element) !== 'UML:ActionState') {
      continue;
    }
    const stereotype = stereotypeOf(element);
    const tagged = taggedValues(element);
    if (stereotype !== 'Lane' && tagged.get('ea_stype') !== 'ActivityPartition') {
      continue;
    }
    const id = attributeOf(element, 'xmi.id');
    if (!id) {
      continue;
    }
    const lane: EaLane = {
      id,
      name: normalizeName(attributeOf(element, 'name') ?? ''),
      activityIds: [],
    };
    node.lanes.push(lane);
    laneById.set(id, lane);
  }

  for (const element of elements) {
    const tag = tagOf(element);
    if (tag !== 'UML:ActionState' && tag !== 'UML:Class') {
      continue;
    }
    const stereotype = stereotypeOf(element);
    const tagged = taggedValues(element);
    const eaType = tagged.get('ea_stype');
    const isLane = stereotype === 'Lane' || eaType === 'ActivityPartition';
    const isActivity =
      stereotype === 'Activity' || eaType === 'Activity' || stereotype === 'InputData';
    if (isLane || !isActivity) {
      continue;
    }
    const id = attributeOf(element, 'xmi.id');
    if (!id) {
      continue;
    }
    const activity: EaActivity = {
      id,
      name: normalizeName(attributeOf(element, 'name') ?? ''),
    };
    const owner = tagged.get('owner');
    const lane = owner ? laneById.get(owner) : undefined;
    if (owner && lane) {
      activity.laneId = owner;
      lane.activityIds.push(id);
    }
    node.activities.push(activity);
  }

  for (const element of elements) {
    if (tagOf(element) !== 'UML:Dependency') {
      continue;
    }
    if (stereotypeOf(element) !== 'DataAssociation') {
      continue;
    }
    const from = attributeOf(element, 'client');
    const to = attributeOf(element, 'supplier');
    if (!from || !to) {
      continue;
    }
    const edge: EaFlowEdge = { from, to };
    const label = attributeOf(element, 'name');
    if (label) {
      edge.label = normalizeName(label);
    }
    node.edges.push(edge);
  }
}

const DATA_IMAGE_URI =
  /data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,([A-Za-z0-9+/=\s]+)/i;
const IMAGE_NAME_HINT = /image/i;
const MAX_EMBEDDED_IMAGE_BYTES = 8 * 1024 * 1024;

const DATA_URI_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  'svg+xml': 'image/svg+xml',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

function decodeBase64Blob(raw: string): Buffer | undefined {
  const cleaned = raw.replace(/\s+/g, '');
  if (cleaned.length < 16 || cleaned.length % 4 !== 0) {
    return undefined;
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
    return undefined;
  }
  try {
    const buffer = Buffer.from(cleaned, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_EMBEDDED_IMAGE_BYTES) {
      return undefined;
    }
    return buffer;
  } catch {
    return undefined;
  }
}

/**
 * Best-effort, conservative scan of a single diagram subtree for an embedded
 * base64 image. Looks first for `data:image/...;base64,` blobs anywhere in the
 * subtree, then for a raw base64 blob under an attribute/tag whose name
 * includes "image". Never throws; returns `undefined` when nothing matches.
 */
function findEmbeddedImage(
  diagram: FxpNode,
  diagramId: string | undefined,
  diagramName: string,
): EaImageAsset | undefined {
  let dataUriResult: EaImageAsset | undefined;
  let rawResult: EaImageAsset | undefined;

  const buildAsset = (buffer: Buffer, mimeType: string): EaImageAsset => {
    const ext = EXT_BY_MIME[mimeType] ?? '.png';
    const base = normalizeAssetKey(diagramId || diagramName || 'diagram');
    const fileName = `${base || 'diagram'}${ext}`;
    return {
      key: normalizeAssetKey(fileName),
      fileName,
      mimeType,
      buffer,
    };
  };

  const consider = (value: string, nameHasImage: boolean): void => {
    if (!dataUriResult) {
      const match = DATA_IMAGE_URI.exec(value);
      if (match) {
        const buffer = decodeBase64Blob(match[2]);
        if (buffer) {
          const mime =
            DATA_URI_MIME[match[1].toLowerCase()] ??
            sniffImageMime(buffer) ??
            'image/png';
          dataUriResult = buildAsset(buffer, mime);
        }
      }
    }
    if (!rawResult && nameHasImage) {
      const buffer = decodeBase64Blob(value);
      if (buffer) {
        const mime = sniffImageMime(buffer);
        if (mime) {
          rawResult = buildAsset(buffer, mime);
        }
      }
    }
  };

  const visit = (node: FxpNode, inheritedHasImage: boolean): void => {
    let nodeHasImage = inheritedHasImage;

    const attrs = node[':@'];
    if (attrs) {
      const tagValue = attrs['@_tag'];
      const tagHasImage =
        tagValue !== undefined &&
        tagValue !== null &&
        IMAGE_NAME_HINT.test(String(tagValue));
      if (tagHasImage) {
        nodeHasImage = true;
      }
      for (const key of Object.keys(attrs)) {
        const value = attrs[key];
        const attrHasImage = IMAGE_NAME_HINT.test(key.replace(/^@_/, ''));
        if (attrHasImage) {
          nodeHasImage = true;
        }
        if (typeof value === 'string' && value.length > 0) {
          consider(value, inheritedHasImage || attrHasImage || tagHasImage);
        }
      }
    }

    const tag = tagOf(node);
    if (tag !== undefined && IMAGE_NAME_HINT.test(tag)) {
      nodeHasImage = true;
    }

    for (const child of childrenOf(node)) {
      if (tagOf(child) === '#text') {
        const value = child['#text'];
        if (typeof value === 'string' && value.length > 0) {
          consider(value, nodeHasImage);
        }
      } else {
        visit(child, nodeHasImage);
      }
    }
  };

  visit(diagram, false);
  return dataUriResult ?? rawResult;
}

function attachDiagrams(
  diagramNodes: FxpNode[],
  nodesById: Map<string, EaPackageNode>,
  warnings: EaParseWarning[],
): void {
  for (const diagram of diagramNodes) {
    const name = normalizeName(attributeOf(diagram, 'name') ?? '');
    const diagramId = attributeOf(diagram, 'xmi.id');
    try {
      const tagged = taggedValues(diagram);
      const ownerId = tagged.get('package') ?? attributeOf(diagram, 'owner') ?? '';
      const owner = ownerId ? nodesById.get(ownerId) : undefined;
      if (!owner) {
        warnings.push({
          page: name,
          reason: `Diagram owner package not found (${ownerId || 'unknown'})`,
        });
        continue;
      }

      const subjectIds: string[] = [];
      let imageId: number | undefined;
      const diagramElement = firstChild(childrenOf(diagram), 'UML:Diagram.element');
      if (diagramElement) {
        for (const entry of findChildren(
          childrenOf(diagramElement),
          'UML:DiagramElement',
        )) {
          const subject = attributeOf(entry, 'subject');
          if (subject && !subjectIds.includes(subject)) {
            subjectIds.push(subject);
          }
          const style = attributeOf(entry, 'style') ?? '';
          const imageMatch = /ImageID=(-?\d+)/.exec(style);
          if (imageMatch) {
            const parsed = parseInt(imageMatch[1], 10);
            if (Number.isFinite(parsed) && parsed > 0 && imageId === undefined) {
              imageId = parsed;
            }
          }
          const endpointPattern = /(?:SOID|EOID)=([^;]+)/g;
          let endpoint: RegExpExecArray | null;
          while ((endpoint = endpointPattern.exec(style)) !== null) {
            if (endpoint[1] && !subjectIds.includes(endpoint[1])) {
              subjectIds.push(endpoint[1]);
            }
          }
        }
      }

      const entry: EaDiagram = { name, ownerId, subjectIds };
      if (imageId !== undefined) {
        entry.imageId = imageId;
      }
      if (diagramId) {
        entry.diagramId = diagramId;
      }
      try {
        const embedded = findEmbeddedImage(diagram, diagramId, name);
        if (embedded) {
          entry.embeddedImage = embedded;
        }
      } catch {
        // best-effort: a malformed embedded image is simply ignored
      }
      owner.diagrams.push(entry);

      // A diagram can carry its own `modeldocument` (e.g. an EA wireframe
      // screen description). Import it as content of the owning package so it
      // is never dropped, exactly like documents attached to elements.
      try {
        const base64 = modelDocumentOf(diagram);
        if (base64) {
          owner.documents.push({
            ownerId,
            ownerName: name || owner.name,
            order: owner.documents.length,
            base64,
          });
        }
      } catch {
        // best-effort: a malformed document on a diagram is ignored
      }
    } catch (error) {
      warnings.push({
        page: name,
        reason: `Failed to read diagram: ${errorMessage(error)}`,
      });
    }
  }
}

export function parseEaXmi(buffer: Buffer): EaParseResult {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('parseEaXmi expects a Buffer');
  }

  const text = decodeBuffer(buffer);
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) {
    throw new Error(
      'EA XMI input contains a DTD or entity declaration; refusing to parse',
    );
  }

  const parser = createXmlParser();

  const parsed = parser.parse(text) as FxpNode[];
  const warnings: EaParseWarning[] = [];

  const xmi = firstChild(parsed, 'XMI');
  const content = xmi ? firstChild(childrenOf(xmi), 'XMI.content') : undefined;
  if (!content) {
    return {
      roots: [],
      warnings: [{ page: '', reason: 'No XMI.content element found' }],
    };
  }

  const model = firstChild(childrenOf(content), 'UML:Model');
  const modelOwned = model
    ? firstChild(childrenOf(model), 'UML:Namespace.ownedElement')
    : undefined;
  const topNodes = modelOwned ? childrenOf(modelOwned) : [];

  const nodesById = new Map<string, EaPackageNode>();
  const roots: EaPackageNode[] = [];

  const buildPackage = (pkg: FxpNode, parent: EaPackageNode | null): EaPackageNode => {
    const id = attributeOf(pkg, 'xmi.id') ?? attributeOf(pkg, 'id') ?? '';
    const name = normalizeName(attributeOf(pkg, 'name') ?? '');
    const tagged = taggedValues(pkg);
    const node: EaPackageNode = {
      id,
      name,
      parentId: parent ? parent.id : null,
      order: orderOf(name, tagged, parent ? parent.children.length : 0),
      documents: [],
      diagrams: [],
      lanes: [],
      activities: [],
      edges: [],
      children: [],
    };
    if (id) {
      nodesById.set(id, node);
    }

    const ownedElement = firstChild(childrenOf(pkg), 'UML:Namespace.ownedElement');
    const direct = ownedElement ? childrenOf(ownedElement) : [];
    const contentNodes = direct.filter((child) => tagOf(child) !== 'UML:Package');

    extractDocuments(contentNodes, node, warnings);
    extractFlow(contentNodes, node);

    for (const childPackage of findChildren(direct, 'UML:Package')) {
      try {
        node.children.push(buildPackage(childPackage, node));
      } catch (error) {
        warnings.push({
          page: name,
          reason: `Failed to read child package: ${errorMessage(error)}`,
        });
      }
    }
    node.children.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return node;
  };

  for (const pkg of findChildren(topNodes, 'UML:Package')) {
    try {
      roots.push(buildPackage(pkg, null));
    } catch (error) {
      warnings.push({
        page: normalizeName(attributeOf(pkg, 'name') ?? ''),
        reason: `Failed to read package: ${errorMessage(error)}`,
      });
    }
  }

  attachDiagrams(findChildren(childrenOf(content), 'UML:Diagram'), nodesById, warnings);

  roots.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  return { roots, warnings };
}
