import { NotificationType } from './notification.constants';

export type NotificationChannel = 'web' | 'email';
export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['web', 'email'];

/**
 * User-facing preference groups -> notification types they control.
 * Types missing here (SIEM, DOCX export, ...) are not user-configurable.
 */
export const NOTIFICATION_PREF_GROUPS: Record<string, string[]> = {
  'page.updated': [NotificationType.PAGE_UPDATED],
  'page.lifecycle': [
    NotificationType.PAGE_CREATED,
    NotificationType.PAGE_TRASHED,
    NotificationType.PAGE_RESTORED,
    NotificationType.PAGE_MOVED,
  ],
  'page.userMention': [NotificationType.PAGE_USER_MENTION],
  'page.permission_granted': [NotificationType.PAGE_PERMISSION_GRANTED],
  'comment.userMention': [NotificationType.COMMENT_USER_MENTION],
  'comment.created': [NotificationType.COMMENT_CREATED],
  'comment.resolved': [NotificationType.COMMENT_RESOLVED],
  'space.membership': ['space.member_added', 'space.member_removed'],
  'page.verification': [
    NotificationType.PAGE_VERIFICATION_EXPIRING,
    NotificationType.PAGE_VERIFICATION_EXPIRED,
    NotificationType.PAGE_VERIFIED,
    NotificationType.PAGE_APPROVAL_REQUESTED,
    NotificationType.PAGE_APPROVAL_REJECTED,
    NotificationType.PAGE_APPROVAL_CLARIFICATION_REQUESTED,
    NotificationType.PAGE_REVERIFICATION_REQUIRED,
  ],
};

export function getPrefGroup(type: string): string | undefined {
  return Object.keys(NOTIFICATION_PREF_GROUPS).find((group) =>
    NOTIFICATION_PREF_GROUPS[group].includes(type),
  );
}

/**
 * Per-group, per-channel switch stored in `settings.notificationPrefs`.
 * Falls back to the legacy single `settings.notifications[group]` switch
 * (false = off for both channels); default is on.
 */
export function isGroupChannelEnabled(
  settings: any,
  group: string,
  channel: NotificationChannel,
): boolean {
  const pref = settings?.notificationPrefs?.[group]?.[channel];
  if (typeof pref === 'boolean') return pref;
  return settings?.notifications?.[group] !== false;
}

export function isChannelEnabled(
  settings: any,
  type: string,
  channel: NotificationChannel,
): boolean {
  const group = getPrefGroup(type);
  return !group || isGroupChannelEnabled(settings, group, channel);
}
