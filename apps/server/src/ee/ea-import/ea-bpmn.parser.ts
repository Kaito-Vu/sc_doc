import {
  EaActivity,
  EaDiagram,
  EaFlowEdge,
  EaLane,
  EaPackageNode,
  EaParseResult,
  EaParseWarning,
} from './types/ea-import.types';
import {
  FxpNode,
  attributeOf,
  childrenOf,
  createXmlParser,
  decodeBuffer,
  findChildrenByLocal,
  firstChildByLocal,
  localTagOf,
  normalizeName,
  textOf,
} from './ea-xml.util';

/**
 * Pure Enterprise Architect BPMN 2.0 (`.xml`) -> page tree parser. BPMN has no
 * packages, so each `bpmn:process` becomes one page whose flow is synthesized
 * from its lanes, flow nodes and sequence flows. No Nest / DB dependencies.
 */

/** Flow-node elements that become ordered steps in the synthesized flow. */
const FLOW_NODE_TAGS = new Set([
  'task',
  'userTask',
  'serviceTask',
  'manualTask',
  'scriptTask',
  'businessRuleTask',
  'sendTask',
  'receiveTask',
  'callActivity',
  'subProcess',
  'transaction',
  'startEvent',
  'endEvent',
  'intermediateCatchEvent',
  'intermediateThrowEvent',
  'boundaryEvent',
  'exclusiveGateway',
  'parallelGateway',
  'inclusiveGateway',
  'eventBasedGateway',
  'complexGateway',
]);

/**
 * Cheap, encoding-safe sniff: an XMI export starts with `<XMI`, a BPMN export
 * with `<bpmn:definitions>` (or an unprefixed `<definitions>` in the BPMN
 * namespace). Operates on the raw bytes so it never throws.
 */
export function isBpmnDocument(buffer: Buffer): boolean {
  if (!Buffer.isBuffer(buffer)) {
    return false;
  }
  const head = buffer.slice(0, 4096).toString('latin1');
  if (/<XMI[\s>/]/i.test(head)) {
    return false;
  }
  if (/<bpmn:definitions[\s>/]/i.test(head)) {
    return true;
  }
  return (
    /<definitions[\s>/]/i.test(head) && /BPMN\/20100524\/MODEL/i.test(head)
  );
}

function addLane(
  laneNode: FxpNode,
  node: EaPackageNode,
  laneIdByActivity: Map<string, string>,
): void {
  const id = attributeOf(laneNode, 'id');
  if (!id) {
    return;
  }
  const lane: EaLane = {
    id,
    name: normalizeName(attributeOf(laneNode, 'name') ?? ''),
    activityIds: [],
  };
  node.lanes.push(lane);
  for (const flowNodeRef of findChildrenByLocal(
    childrenOf(laneNode),
    'flowNodeRef',
  )) {
    const ref = textOf(flowNodeRef).trim();
    if (ref && !lane.activityIds.includes(ref)) {
      lane.activityIds.push(ref);
      laneIdByActivity.set(ref, id);
    }
  }
}

function collectLanes(
  nodes: FxpNode[],
  node: EaPackageNode,
  laneIdByActivity: Map<string, string>,
): void {
  for (const child of nodes) {
    const tag = localTagOf(child);
    if (!tag || tag === '#text') {
      continue;
    }
    if (tag === 'laneSet' || tag === 'childLaneSet') {
      for (const lane of findChildrenByLocal(childrenOf(child), 'lane')) {
        addLane(lane, node, laneIdByActivity);
      }
      collectLanes(childrenOf(child), node, laneIdByActivity);
    } else {
      collectLanes(childrenOf(child), node, laneIdByActivity);
    }
  }
}

function collectFlowActivities(
  nodes: FxpNode[],
  laneIdByActivity: Map<string, string>,
): EaActivity[] {
  const activities: EaActivity[] = [];
  for (const child of nodes) {
    const tag = localTagOf(child);
    if (!tag || tag === '#text' || !FLOW_NODE_TAGS.has(tag)) {
      continue;
    }
    const id = attributeOf(child, 'id');
    if (!id) {
      continue;
    }
    const activity: EaActivity = {
      id,
      name: normalizeName(attributeOf(child, 'name') ?? ''),
    };
    const laneId = laneIdByActivity.get(id);
    if (laneId) {
      activity.laneId = laneId;
    }
    activities.push(activity);
  }
  return activities;
}

function collectEdges(nodes: FxpNode[]): EaFlowEdge[] {
  const edges: EaFlowEdge[] = [];
  for (const flow of findChildrenByLocal(nodes, 'sequenceFlow')) {
    const from = attributeOf(flow, 'sourceRef');
    const to = attributeOf(flow, 'targetRef');
    if (!from || !to) {
      continue;
    }
    const edge: EaFlowEdge = { from, to };
    const label = attributeOf(flow, 'name');
    if (label) {
      edge.label = normalizeName(label);
    }
    edges.push(edge);
  }
  return edges;
}

function attachDiagrams(
  definitionChildren: FxpNode[],
  nodesById: Map<string, EaPackageNode>,
): void {
  for (const diagram of findChildrenByLocal(
    definitionChildren,
    'BPMNDiagram',
  )) {
    const plane = firstChildByLocal(childrenOf(diagram), 'BPMNPlane');
    const ownerId = plane ? (attributeOf(plane, 'bpmnElement') ?? '') : '';
    const owner = ownerId ? nodesById.get(ownerId) : undefined;
    if (!owner) {
      continue;
    }
    const name = normalizeName(attributeOf(diagram, 'name') ?? owner.name);
    const diagramId = attributeOf(diagram, 'id');
    const subjectIds: string[] = [];
    if (plane) {
      for (const shape of findChildrenByLocal(childrenOf(plane), 'BPMNShape')) {
        const element = attributeOf(shape, 'bpmnElement');
        if (element && !subjectIds.includes(element)) {
          subjectIds.push(element);
        }
      }
    }
    const entry: EaDiagram = { name, ownerId, subjectIds };
    if (diagramId) {
      entry.diagramId = diagramId;
    }
    owner.diagrams.push(entry);
  }
}

export function parseEaBpmn(buffer: Buffer): EaParseResult {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('parseEaBpmn expects a Buffer');
  }

  const text = decodeBuffer(buffer);
  if (/<!DOCTYPE/i.test(text) || /<!ENTITY/i.test(text)) {
    throw new Error(
      'BPMN input contains a DTD or entity declaration; refusing to parse',
    );
  }

  const parser = createXmlParser();
  const parsed = parser.parse(text) as FxpNode[];
  const warnings: EaParseWarning[] = [];

  const definitions = parsed.find((node) => localTagOf(node) === 'definitions');
  if (!definitions) {
    return {
      roots: [],
      warnings: [{ page: '', reason: 'No BPMN definitions element found' }],
    };
  }

  const definitionsName = normalizeName(attributeOf(definitions, 'name') ?? '');
  const definitionChildren = childrenOf(definitions);

  const participantByProcess = new Map<string, string>();
  for (const collaboration of findChildrenByLocal(
    definitionChildren,
    'collaboration',
  )) {
    for (const participant of findChildrenByLocal(
      childrenOf(collaboration),
      'participant',
    )) {
      const processRef = attributeOf(participant, 'processRef');
      const name = attributeOf(participant, 'name');
      if (processRef && name && !participantByProcess.has(processRef)) {
        participantByProcess.set(processRef, normalizeName(name));
      }
    }
  }

  const nodesById = new Map<string, EaPackageNode>();
  const roots: EaPackageNode[] = [];

  findChildrenByLocal(definitionChildren, 'process').forEach(
    (process, index) => {
      const id = attributeOf(process, 'id') ?? '';
      const processName = attributeOf(process, 'name');
      const name = normalizeName(
        processName ??
          (id ? participantByProcess.get(id) : undefined) ??
          definitionsName,
      );
      const node: EaPackageNode = {
        id,
        name,
        parentId: null,
        order: index,
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

      const processChildren = childrenOf(process);
      const laneIdByActivity = new Map<string, string>();
      collectLanes(processChildren, node, laneIdByActivity);
      node.activities.push(
        ...collectFlowActivities(processChildren, laneIdByActivity),
      );
      node.edges.push(...collectEdges(processChildren));

      roots.push(node);
    },
  );

  attachDiagrams(definitionChildren, nodesById);

  return { roots, warnings };
}
