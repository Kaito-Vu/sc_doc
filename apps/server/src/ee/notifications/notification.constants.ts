export const EeNotificationType = {
  PAGE_CREATED: 'page.created',
  PAGE_TRASHED: 'page.trashed',
  PAGE_RESTORED: 'page.restored',
  PAGE_MOVED: 'page.moved',
  SPACE_MEMBER_ADDED: 'space.member_added',
  SPACE_MEMBER_REMOVED: 'space.member_removed',
} as const;

export type EeNotificationType =
  (typeof EeNotificationType)[keyof typeof EeNotificationType];

/** A page edit can produce many content snapshots; collapse them per-recipient. */
export const PAGE_EDIT_SUPPLEMENT_COOLDOWN_HOURS = 0.25;

/** Page lifecycle events are collapsed per recipient within this window. */
export const PAGE_LIFECYCLE_COOLDOWN_HOURS = 0.25;

/** Bulk imports / duplications should not fan out thousands of notifications. */
export const MAX_PAGE_LIFECYCLE_FANOUT = 20;
