import { INotification } from "@/features/notification/types/notification.types";

const MESSAGE_KEYS: Partial<Record<INotification["type"], string>> = {
  "page.created": "<bold>{{name}}</bold> created a page",
  "page.trashed": "<bold>{{name}}</bold> moved a page to trash",
  "page.restored": "<bold>{{name}}</bold> restored a page",
  "page.moved": "<bold>{{name}}</bold> moved a page to another space",
  "space.member_added": "<bold>{{name}}</bold> added you to a space",
  "space.member_removed": "You were removed from a space",
};

export function getEeNotificationMessageKey(
  notification: INotification,
): string | undefined {
  // Restores carry no actor; avoid rendering an empty bold name.
  if (notification.type === "page.restored" && !notification.actor) {
    return "A page was restored";
  }
  return MESSAGE_KEYS[notification.type];
}

export function getEeNotificationUrl(
  notification: INotification,
): string | undefined {
  switch (notification.type) {
    case "page.trashed":
      return notification.space
        ? `/s/${notification.space.slug}/trash`
        : undefined;
    case "space.member_added":
      return notification.space
        ? `/s/${notification.space.slug}`
        : undefined;
    case "space.member_removed":
      return "/";
    default:
      return undefined;
  }
}
