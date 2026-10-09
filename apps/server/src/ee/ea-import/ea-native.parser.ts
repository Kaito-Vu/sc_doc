import {
  EaActivity,
  EaDiagram,
  EaDocumentPayload,
  EaFlowEdge,
  EaImageAsset,
  EaPackageNode,
  EaParseResult,
  EaParseWarning,
} from './types/ea-import.types';
import {
  imageExtForMime,
  normalizeAssetKey,
  sniffImageMime,
} from './ea-asset.util';
import {
  FxpNode,
  attributeOf,
  childrenOf,
  createXmlParser,
  decodeBuffer,
  findChildren,
  normalizeName,
  tagOf,
  textOf,
} from './ea-xml.util';

/**
 * Pure Enterprise Architect *native* XML (`.xml`) -> page tree parser.
 *
 * EA's "Export Package to XML" produces a database-shaped document:
 *
 *   <Package name="...">
 *     <Table name="t_package"><Row><Column name="..." value="..."/></Row>...</Table>
 *     <Table name="t_object">...
 *     ...
 *   </Package>
 *
 * Unlike the XMI/BPMN exports there is no UML element tree: packages, flow
 * elements, diagrams and model documents are reconstructed from the `t_*`
 * tables (references by numeric id/EA GUID). No Nest / DB dependencies.
 */

/** Object types that become flow steps (lanes are handled separately). */
const ACTIVITY_OBJECT_TYPES = new Set(['Activity', 'StateNode', 'Action']);

const TABLE_HINT =
  /<Table\b[^>]*\bname="t_(package|object|diagram|connector|document)"/i;

/**
 * Cheap, encoding-safe sniff for an EA native table export. Operates on the
 * raw bytes so it never throws; XMI and BPMN documents are excluded up-front.
 */
export function isEaNativeDocument(buffer: Buffer): boolean {
  if (!Buffer.isBuffer(buffer)) {
    return false;
  }
  const head = buffer.slice(0, 8192).toString('latin1');
  if (/<XMI[\s>/]/i.test(head)) {
    return false;
  }
  if (/<bpmn:definitions[\s>/]/i.test(head)) {
    return false;
  }
  return /<Package[\s>]/i.test(head) && TABLE_HINT.test(head);
}

type Row = Map<string, string>;

function parseNumeric(value: string | undefined): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function leadingInteger(name: string): number | undefined {
  const match = /^\s*(\d+)/.exec(name);
  return match ? parseNumeric(match[1]) : undefined;
}

/**
 * Read one `t_*` table into an array of column-name -> value maps. Multi-line
 * attribute values (e.g. `BINCONTENT` base64) are emitted by `fast-xml-parser`
 * as element text instead of an attribute, so fall back to `textOf`.
 */
function readTable(root: FxpNode, tableName: string): Row[] {
  const table = findChildren(childrenOf(root), 'Table').find(
    (node) => attributeOf(node, 'name') === tableName,
  );
  if (!table) {
    return [];
  }
  const rows: Row[] = [];
  for (const row of findChildren(childrenOf(table), 'Row')) {
    const columns: Row = new Map<string, string>();
    for (const column of findChildren(childrenOf(row), 'Column')) {
      const name = attributeOf(column, 'name');
      if (!name || columns.has(name)) {
        continue;
      }
      columns.set(name, attributeOf(column, 'value') ?? textOf(column));
    }
    rows.push(columns);
  }
  return rows;
}

/** Read `guided` -> stereotype `Name=` from the `t_xref` element stereotypes. */
function readStereotypes(rows: Row[]): Map<string, string> {
  const byGuid = new Map<string, string>();
  for (const row of rows) {
    if (row.get('NAME') !== 'Stereotypes') {
      continue;
    }
    const guid = row.get('CLIENT');
    if (!guid || byGuid.has(guid)) {
      continue;
    }
    const match = /@STEREO;Name=([^;]*);/.exec(row.get('DESCRIPTION') ?? '');
    if (match && match[1]) {
      byGuid.set(guid, match[1]);
    }
  }
  return byGuid;
}

/**
 * Decode the embedded image assets in the `t_image` table. EA stores the
 * actual bytes in the `IMAGE` column (`dt:dt="bin.base64"`), which the native
 * XML export *does* include — so wireframe/diagram images are recoverable
 * without an EA HTML report or a companion `Images/` ZIP.
 */
function readImages(root: FxpNode): Map<string, EaImageAsset> {
  const images = new Map<string, EaImageAsset>();
  for (const row of readTable(root, 't_image')) {
    const id = row.get('IMAGEID');
    if (!id) {
      continue;
    }
    const cleaned = (row.get('IMAGE') ?? '').replace(/\s+/g, '');
    if (cleaned.length < 16 || cleaned.length % 4 !== 0) {
      continue;
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) {
      continue;
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(cleaned, 'base64');
    } catch {
      continue;
    }
    if (buffer.length === 0) {
      continue;
    }
    const mimeType = sniffImageMime(buffer);
    if (!mimeType) {
      continue;
    }
    const base = row.get('NAME') || `image-${id}`;
    const fileName = `${base}${imageExtForMime(mimeType)}`;
    images.set(id, {
      key: normalizeAssetKey(fileName),
      fileName,
      mimeType,
      buffer,
    });
  }
  return images;
}

function buildPackages(root: FxpNode): {
  nodes: EaPackageNode[];
  roots: EaPackageNode[];
  byPackageId: Map<string, EaPackageNode>;
} {
  const rows = readTable(root, 't_package');
  const byPackageId = new Map<string, EaPackageNode>();
  const nodes: EaPackageNode[] = [];
  const entries: Array<{
    node: EaPackageNode;
    packageId: string;
    parentPackageId: string | null;
  }> = [];

  rows.forEach((row, index) => {
    const packageId = row.get('PACKAGE_ID') ?? '';
    const name = normalizeName(row.get('NAME') ?? '');
    const id = row.get('EA_GUID') || packageId || `pkg-${index}`;
    const node: EaPackageNode = {
      id,
      name,
      parentId: null,
      order: parseNumeric(row.get('TPOS')) ?? leadingInteger(name) ?? index,
      documents: [],
      diagrams: [],
      lanes: [],
      activities: [],
      edges: [],
      children: [],
    };
    if (packageId) {
      byPackageId.set(packageId, node);
    }
    nodes.push(node);
    entries.push({
      node,
      packageId,
      parentPackageId: row.get('PARENT_ID') ?? null,
    });
  });

  const idSet = new Set(
    entries.map((entry) => entry.packageId).filter((id): id is string => Boolean(id)),
  );
  const roots: EaPackageNode[] = [];

  for (const entry of entries) {
    const parentId = entry.parentPackageId;
    const parent =
      parentId && idSet.has(parentId) ? byPackageId.get(parentId) : undefined;
    if (parent && parent !== entry.node) {
      entry.node.parentId = parent.id;
      parent.children.push(entry.node);
    } else {
      entry.node.parentId = null;
      roots.push(entry.node);
    }
  }

  const sortChildren = (node: EaPackageNode): void => {
    node.children.sort(
      (a, b) => a.order - b.order || a.name.localeCompare(b.name),
    );
    node.children.forEach(sortChildren);
  };
  roots.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  roots.forEach(sortChildren);

  return { nodes, roots, byPackageId };
}

function attachObjects(root: FxpNode, byPackageId: Map<string, EaPackageNode>): {
  packageByObjectId: Map<string, string>;
} {
  const objectRows = readTable(root, 't_object');
  const stereotypes = readStereotypes(readTable(root, 't_xref'));

  const objectsByPackage = new Map<string, Row[]>();
  for (const row of objectRows) {
    const packageId = row.get('PACKAGE_ID') ?? '';
    if (!packageId) {
      continue;
    }
    const list = objectsByPackage.get(packageId) ?? [];
    list.push(row);
    objectsByPackage.set(packageId, list);
  }

  const packageByObjectId = new Map<string, string>();

  for (const [packageId, objects] of objectsByPackage) {
    const node = byPackageId.get(packageId);
    if (!node) {
      continue;
    }
    const hasPartition = objects.some(
      (row) => row.get('OBJECT_TYPE') === 'ActivityPartition',
    );

    for (const row of objects) {
      if (row.get('OBJECT_TYPE') !== 'ActivityPartition') {
        continue;
      }
      const id = row.get('OBJECT_ID');
      if (!id) {
        continue;
      }
      node.lanes.push({
        id,
        name: normalizeName(row.get('NAME') ?? ''),
        activityIds: [],
      });
    }
    const laneById = new Map(node.lanes.map((lane) => [lane.id, lane]));

    for (const row of objects) {
      const id = row.get('OBJECT_ID');
      if (!id) {
        continue;
      }
      const type = row.get('OBJECT_TYPE') ?? '';
      const stereotype = stereotypes.get(row.get('EA_GUID') ?? '');
      const isActivity =
        ACTIVITY_OBJECT_TYPES.has(type) ||
        (type === 'Class' && (hasPartition || stereotype === 'InputData'));
      if (!isActivity) {
        continue;
      }
      const activity: EaActivity = {
        id,
        name: normalizeName(row.get('NAME') ?? ''),
      };
      const parentId = row.get('PARENTID');
      const lane = parentId ? laneById.get(parentId) : undefined;
      if (lane) {
        activity.laneId = lane.id;
        lane.activityIds.push(id);
      }
      node.activities.push(activity);
      packageByObjectId.set(id, packageId);
    }
  }

  return { packageByObjectId };
}

function attachEdges(
  root: FxpNode,
  byPackageId: Map<string, EaPackageNode>,
  packageByObjectId: Map<string, string>,
): void {
  for (const row of readTable(root, 't_connector')) {
    const start = row.get('START_OBJECT_ID');
    const end = row.get('END_OBJECT_ID');
    if (!start || !end) {
      continue;
    }
    const startPackage = packageByObjectId.get(start);
    const endPackage = packageByObjectId.get(end);
    if (!startPackage || startPackage !== endPackage) {
      continue;
    }
    const node = byPackageId.get(startPackage);
    if (!node) {
      continue;
    }
    let from = start;
    let to = end;
    if ((row.get('DIRECTION') ?? '').toLowerCase().startsWith('destination')) {
      from = end;
      to = start;
    }
    const edge: EaFlowEdge = { from, to };
    const label = row.get('NAME');
    if (label) {
      edge.label = normalizeName(label);
    }
    node.edges.push(edge);
  }
}

function attachDocuments(
  root: FxpNode,
  byPackageId: Map<string, EaPackageNode>,
  warnings: EaParseWarning[],
): void {
  const byName = new Map<string, EaPackageNode>();
  for (const node of byPackageId.values()) {
    if (node.name && !byName.has(node.name)) {
      byName.set(node.name, node);
    }
  }

  let index = 0;
  for (const row of readTable(root, 't_document')) {
    const base64 = (row.get('BINCONTENT') ?? '').trim();
    const docName = normalizeName(row.get('DOCNAME') ?? '');
    const segments = docName.split('::');
    const title = segments[segments.length - 1] || docName;
    const packageName = segments.length >= 2 ? segments[segments.length - 2] : '';
    index += 1;
    if (!base64) {
      continue;
    }
    const node = packageName ? byName.get(packageName) : undefined;
    if (!node) {
      warnings.push({
        page: title,
        reason: `Model document owner package not found (${packageName || 'unknown'})`,
      });
      continue;
    }
    const document: EaDocumentPayload = {
      ownerId: node.id,
      ownerName: title,
      order: parseNumeric(row.get('SEQUENCE')) ?? index,
      base64,
    };
    node.documents.push(document);
  }

  for (const node of byPackageId.values()) {
    node.documents.sort((a, b) => a.order - b.order);
  }
}

function attachDiagrams(
  root: FxpNode,
  byPackageId: Map<string, EaPackageNode>,
  warnings: EaParseWarning[],
  imagesById: Map<string, EaImageAsset>,
): void {
  const objectsByDiagram = new Map<string, Row[]>();
  for (const row of readTable(root, 't_diagramobjects')) {
    const diagramId = row.get('DIAGRAM_ID') ?? '';
    if (!diagramId) {
      continue;
    }
    const list = objectsByDiagram.get(diagramId) ?? [];
    list.push(row);
    objectsByDiagram.set(diagramId, list);
  }

  for (const row of readTable(root, 't_diagram')) {
    const name = normalizeName(row.get('NAME') ?? '');
    const packageId = row.get('PACKAGE_ID') ?? '';
    const node = packageId ? byPackageId.get(packageId) : undefined;
    if (!node) {
      warnings.push({
        page: name,
        reason: `Diagram owner package not found (${packageId || 'unknown'})`,
      });
      continue;
    }

    const diagramId = row.get('DIAGRAM_ID') ?? '';
    const subjectIds: string[] = [];
    let imageId: number | undefined;
    for (const entry of objectsByDiagram.get(diagramId) ?? []) {
      const objectId = entry.get('OBJECT_ID');
      if (objectId && !subjectIds.includes(objectId)) {
        subjectIds.push(objectId);
      }
      const match = /ImageID=(-?\d+)/.exec(entry.get('OBJECTSTYLE') ?? '');
      if (match) {
        const parsed = parseNumeric(match[1]);
        if (parsed !== undefined && parsed > 0 && imageId === undefined) {
          imageId = parsed;
        }
      }
    }

    const diagram: EaDiagram = { name, ownerId: node.id, subjectIds };
    if (diagramId) {
      diagram.diagramId = diagramId;
    }
    if (imageId !== undefined) {
      diagram.imageId = imageId;
      const embedded = imagesById.get(String(imageId));
      if (embedded) {
        diagram.embeddedImage = embedded;
      }
    }
    node.diagrams.push(diagram);
  }
}

export function parseEaNative(buffer: Buffer): EaParseResult {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('parseEaNative expects a Buffer');
  }

  const text = decodeBuffer(buffer);
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) {
    throw new Error(
      'EA XML input contains a DTD or entity declaration; refusing to parse',
    );
  }

  const parser = createXmlParser();
  const parsed = parser.parse(text) as FxpNode[];
  const warnings: EaParseWarning[] = [];

  const root = parsed.find((node) => tagOf(node) === 'Package');
  if (!root) {
    return {
      roots: [],
      warnings: [{ page: '', reason: 'No EA Package element found' }],
    };
  }

  const { roots, byPackageId } = buildPackages(root);
  if (roots.length === 0) {
    return {
      roots: [],
      warnings: [{ page: '', reason: 'No t_package rows found' }],
    };
  }

  const { packageByObjectId } = attachObjects(root, byPackageId);
  attachEdges(root, byPackageId, packageByObjectId);
  attachDocuments(root, byPackageId, warnings);
  attachDiagrams(root, byPackageId, warnings, readImages(root));

  return { roots, warnings };
}
