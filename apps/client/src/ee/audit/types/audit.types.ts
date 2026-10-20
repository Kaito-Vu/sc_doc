export type AuditActorType = "user" | "system" | "api_key" | "oauth";

export type IAuditLog = {
  id: string;
  workspaceId: string;
  actorId?: string;
  actorType: AuditActorType | string;
  event: string;
  resourceType: string;
  resourceId?: string;
  spaceId?: string;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string;
  } | null;
  resource?: {
    id: string;
    name: string;
    slug?: string;
    slugId?: string;
    spaceSlug?: string;
  } | null;
};

export type IAuditLogParams = {
  event?: string;
  events?: string[];
  search?: string;
  resourceType?: string;
  resourceId?: string;
  actorId?: string;
  actorTypes?: string[];
  spaceId?: string;
  startDate?: string;
  endDate?: string;
  ipAddress?: string;
  cursor?: string;
  beforeCursor?: string;
  limit?: number;
};

export type IAuditCount = {
  count: number;
};

export type IAuditEventCount = IAuditCount & {
  event: string;
};

export type IAuditResourceCount = IAuditCount & {
  resourceType: string;
};

export type IAuditTimelinePoint = IAuditCount & {
  date: string;
};

export type IAuditActorStat = IAuditCount & {
  actorId: string;
  actorType: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

export type IAuditIpStat = IAuditCount & {
  ipAddress: string;
};

export type IAuditStats = {
  total: number;
  today: number;
  activeActors: number;
  securityEvents: number;
  failedLogins: number;
  byEvent: IAuditEventCount[];
  byResourceType: IAuditResourceCount[];
  timeline: IAuditTimelinePoint[];
  topActors: IAuditActorStat[];
  topIps: IAuditIpStat[];
};

export type IAuditFacets = {
  events: IAuditEventCount[];
  resourceTypes: IAuditResourceCount[];
  actors: IAuditActorStat[];
  actorTypes: (IAuditCount & { actorType: string })[];
  spaces: {
    spaceId: string;
    name?: string | null;
    slug?: string | null;
    count: number;
  }[];
};
