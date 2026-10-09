export interface EaDocumentPayload {
  ownerId: string;
  ownerName: string;
  order: number;
  base64: string;
}

export interface EaImageAsset {
  key: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface EaRtfImage {
  mimeType: string;
  buffer: Buffer;
}

export interface EaDiagram {
  name: string;
  ownerId: string;
  imageId?: number;
  subjectIds: string[];
  diagramId?: string;
  embeddedImage?: EaImageAsset;
}

export interface EaFlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface EaActivity {
  id: string;
  name: string;
  laneId?: string;
}

export interface EaLane {
  id: string;
  name: string;
  activityIds: string[];
}

export interface EaPackageNode {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  documents: EaDocumentPayload[];
  diagrams: EaDiagram[];
  lanes: EaLane[];
  activities: EaActivity[];
  edges: EaFlowEdge[];
  children: EaPackageNode[];
}

export interface EaParseWarning {
  page: string;
  reason: string;
}

export interface EaParseResult {
  roots: EaPackageNode[];
  warnings: EaParseWarning[];
}
