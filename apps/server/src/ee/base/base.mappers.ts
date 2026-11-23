export function mapDate(d: unknown) {
  return (d as Date)?.toISOString?.() ?? d;
}

export function mapProperty(p: any) {
  return {
    id: p.id,
    pageId: p.pageId,
    name: p.name,
    type: p.type,
    position: p.position,
    typeOptions: p.typeOptions ?? {},
    pendingType: p.pendingType,
    pendingTypeOptions: p.pendingTypeOptions,
    isPrimary: p.isPrimary,
    workspaceId: p.workspaceId,
    createdAt: mapDate(p.createdAt),
    updatedAt: mapDate(p.updatedAt),
  };
}

export function mapView(v: any) {
  return {
    id: v.id,
    pageId: v.pageId,
    name: v.name,
    type: v.type,
    config: v.config ?? {},
    position: v.position,
    workspaceId: v.workspaceId,
    creatorId: v.creatorId,
    createdAt: mapDate(v.createdAt),
    updatedAt: mapDate(v.updatedAt),
  };
}

export function mapRow(r: any) {
  return {
    id: r.id,
    pageId: r.pageId,
    cells: r.cells ?? {},
    position: r.position,
    creatorId: r.creatorId,
    lastUpdatedById: r.lastUpdatedById,
    workspaceId: r.workspaceId,
    createdAt: mapDate(r.createdAt),
    updatedAt: mapDate(r.updatedAt),
  };
}
