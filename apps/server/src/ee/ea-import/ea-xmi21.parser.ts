import {
  EaActivity,
  EaDiagram,
  EaLane,
  EaPackageNode,
  EaParseResult,
  EaParseWarning,
  EaWireframeShape,
} from './types/ea-import.types';
import {
  EaWireframeControl,
  toWireframeShape,
  wireframeControl,
} from './ea-wireframe';
import {
  FxpNode,
  attributeOf,
  childrenOf,
  findChildren,
  firstChild,
  leadingInteger,
  normalizeName,
  parseXmlDocument,
  tagOf,
} from './ea-xml.util';
import { errorMessage, splitMultiItems } from './ea-import.util';

/**
 * Enterprise Architect XMI 2.1 (`<xmi:XMI xmi:version="2.1">`) -> package tree.
 * Imports the package hierarchy, diagrams (owner + subjects) and activity
 * lanes. XMI 2.1 carries no RTF `modeldocument` payloads, so pages are
 * structural only.
 */

export function isXmi21Document(buffer: Buffer): boolean {
  return /<xmi:XMI[\s>]/i.test(buffer.slice(0, 4096).toString('latin1'));
}

const type = (n: FxpNode) => attributeOf(n, 'xmi:type');

function collect(nodes: FxpNode[], out: FxpNode[]): void {
  for (const node of nodes) {
    if (tagOf(node) !== 'packagedElement' || type(node) === 'uml:Package') {
      continue;
    }
    out.push(node);
    collect(childrenOf(node), out);
  }
}

function extractFlow(direct: FxpNode[], node: EaPackageNode): void {
  const elements: FxpNode[] = [];
  collect(direct, elements);
  const laneById = new Map<string, EaLane>();
  const laneOfActivity = new Map<string, string>();

  for (const el of elements) {
    for (const group of findChildren(childrenOf(el), 'group')) {
      const id = attributeOf(group, 'xmi:id');
      if (!id || type(group) !== 'uml:ActivityPartition') continue;
      const activityIds = findChildren(childrenOf(group), 'node')
        .map((n) => attributeOf(n, 'xmi:idref'))
        .filter((v): v is string => !!v);
      const lane: EaLane = {
        id,
        name: normalizeName(attributeOf(group, 'name') ?? ''),
        activityIds,
      };
      node.lanes.push(lane);
      laneById.set(id, lane);
      activityIds.forEach((a) => laneOfActivity.set(a, id));
    }
  }

  const elementSet = new Set(elements);
  for (const el of elements) {
    const id = attributeOf(el, 'xmi:id');
    // leaf activities only: the wrapper activity (EA_Activity1) just holds lanes
    const nested = childrenOf(el).some((child) => elementSet.has(child));
    if (!id || type(el) !== 'uml:Activity' || nested) continue;
    const activity: EaActivity = {
      id,
      name: normalizeName(attributeOf(el, 'name') ?? ''),
    };
    const laneId = laneOfActivity.get(id);
    if (laneId) activity.laneId = laneId;
    node.activities.push(activity);
  }
}

export function parseEaXmi21(buffer: Buffer): EaParseResult {
  const parsed = parseXmlDocument(buffer, 'EA XMI');
  const warnings: EaParseWarning[] = [];

  const xmi = firstChild(parsed, 'xmi:XMI');
  const xmiChildren = xmi ? childrenOf(xmi) : [];
  const model = firstChild(xmiChildren, 'uml:Model');
  if (!model) {
    return {
      roots: [],
      warnings: [{ page: '', reason: 'No uml:Model element found' }],
    };
  }

  const extension = firstChild(xmiChildren, 'xmi:Extension');
  const extChildren = extension ? childrenOf(extension) : [];

  // Package sort position lives in the EA extension (`<element><model tpos>`).
  const tposById = new Map<string, number>();
  // Wireframing controls by id: stereotype + visible text.
  const controlById = new Map<string, EaWireframeControl>();
  const elementsNode = firstChild(extChildren, 'elements');
  for (const el of findChildren(elementsNode ? childrenOf(elementsNode) : [], 'element')) {
    const id = attributeOf(el, 'xmi:idref');
    const m = firstChild(childrenOf(el), 'model');
    const tpos = m ? parseInt(attributeOf(m, 'tpos') ?? '', 10) : NaN;
    if (id && Number.isFinite(tpos)) tposById.set(id, tpos);
    const props = firstChild(childrenOf(el), 'properties');
    const control = wireframeControl(
      props && attributeOf(props, 'stereotype'),
      attributeOf(el, 'name'),
      props && attributeOf(props, 'documentation'),
    );
    if (id && control) controlById.set(id, control);
  }

  const nodesById = new Map<string, EaPackageNode>();
  const isPackage = (n: FxpNode) =>
    tagOf(n) === 'packagedElement' && type(n) === 'uml:Package';

  const build = (pkg: FxpNode, parent: EaPackageNode | null): EaPackageNode => {
    const id = attributeOf(pkg, 'xmi:id') ?? '';
    const name = normalizeName(attributeOf(pkg, 'name') ?? '');
    const node: EaPackageNode = {
      id,
      name,
      parentId: parent ? parent.id : null,
      order:
        leadingInteger(name) ??
        tposById.get(id) ??
        (parent ? parent.children.length : 0),
      documents: [],
      diagrams: [],
      lanes: [],
      activities: [],
      edges: [],
      children: [],
    };
    if (id) nodesById.set(id, node);
    const direct = childrenOf(pkg);
    extractFlow(direct, node);
    for (const child of direct.filter(isPackage)) {
      try {
        node.children.push(build(child, node));
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

  const roots = childrenOf(model)
    .filter(isPackage)
    .map((pkg) => build(pkg, null));

  const diagramsNode = firstChild(extChildren, 'diagrams');
  for (const diagram of findChildren(diagramsNode ? childrenOf(diagramsNode) : [], 'diagram')) {
    const parts = childrenOf(diagram);
    const props = firstChild(parts, 'properties');
    const name = normalizeName((props && attributeOf(props, 'name')) ?? '');
    const m = firstChild(parts, 'model');
    const ownerId = (m && (attributeOf(m, 'package') ?? attributeOf(m, 'owner'))) ?? '';
    const owner = nodesById.get(ownerId);
    if (!owner) {
      warnings.push({ page: name, reason: `Diagram owner package not found (${ownerId || 'unknown'})` });
      continue;
    }
    const subjectIds: string[] = [];
    const wireframe: EaWireframeShape[] = [];
    const els = firstChild(parts, 'elements');
    for (const e of findChildren(els ? childrenOf(els) : [], 'element')) {
      const subject = attributeOf(e, 'subject');
      if (subject && !subjectIds.includes(subject)) subjectIds.push(subject);
      const control = subject ? controlById.get(subject) : undefined;
      const shape =
        control &&
        toWireframeShape(control, attributeOf(e, 'geometry') ?? '', attributeOf(e, 'style') ?? '');
      if (shape) wireframe.push(shape);
    }
    const entry: EaDiagram = { name, ownerId, subjectIds };
    if (wireframe.length > 0) entry.wireframe = wireframe;
    const diagramId = attributeOf(diagram, 'xmi:id');
    if (diagramId) entry.diagramId = diagramId;
    owner.diagrams.push(entry);
  }

  roots.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  splitMultiItems(roots);
  return { roots, warnings };
}
