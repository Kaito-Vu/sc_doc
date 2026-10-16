import { Badge, Menu, Tooltip } from "@mantine/core";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { usePageLock } from "./use-page-lock";

export function PageLockMenuItem({ readOnly }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const { page, locked, canUnlock, lock, unlock } = usePageLock();

  if (page?.isBase) return null;

  if (locked) {
    return canUnlock ? (
      <Menu.Item
        leftSection={<IconLockOpen size={16} />}
        onClick={() => unlock.mutate()}
      >
        {t("Unlock page")}
      </Menu.Item>
    ) : null;
  }

  return readOnly ? null : (
    <Menu.Item
      leftSection={<IconLock size={16} />}
      onClick={() => lock.mutate()}
    >
      {t("Lock page")}
    </Menu.Item>
  );
}

export function PageLockBadge() {
  const { t } = useTranslation();
  const { locked, lockedByMe } = usePageLock();

  if (!locked) return null;

  return (
    <Tooltip
      label={
        lockedByMe
          ? t("Locked by you. Others can only view this page.")
          : t("This page is locked. You can only view it.")
      }
    >
      <Badge
        variant="light"
        color="orange"
        size="sm"
        leftSection={<IconLock size={12} />}
      >
        {t("Locked")}
      </Badge>
    </Tooltip>
  );
}
