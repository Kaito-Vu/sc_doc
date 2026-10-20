export interface PageIdsEvent {
  pageIds: string[];
  workspaceId: string;
}

export interface PageMovedEvent extends PageIdsEvent {
  spaceId: string;
  oldSpaceId?: string;
  actorId?: string;
}

export interface SpaceMemberEvent {
  userIds?: string[];
  groupIds?: string[];
  spaceId: string;
  workspaceId: string;
  actorId?: string;
}

export interface EePageContext {
  id: string;
  title: string | null;
  slugId: string;
  spaceId: string;
  workspaceId: string;
  parentPageId: string | null;
  creatorId: string | null;
  deletedById: string | null;
  spaceSlug: string;
  spaceName: string | null;
}

export interface EeSpaceContext {
  id: string;
  slug: string;
  name: string | null;
  workspaceId: string;
}

export interface NotificationUser {
  id: string;
  name: string;
  email: string;
}

export interface EmailContent {
  subject: string;
  template: unknown;
}
