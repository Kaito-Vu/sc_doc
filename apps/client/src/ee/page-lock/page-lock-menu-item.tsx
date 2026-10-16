import { Badge, Button, Menu, Popover, Stack, Text } from "@mantine/core";
import { formattedDate } from "@/lib/time.ts";
import { IconLock, IconLockOpen } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { usePageLock } from "./use-page-lock";

export function PageLockMenuItem({ readOnly }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const { enabled, page, locked, canUnlock, lock, unlock } = usePageLock();

  if (!enabled || page?.isBase) return null;

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
  const { locked, lockedByMe, canUnlock, unlock, lockedBy, lockedAt, expiresAt } =
    usePageLock();

  if (!locked) return null;

  return (
    <Popover width={280} position="bottom-end" withArrow shadow="md">
      <Popover.Target>
        <Badge
          variant="light"
          color="orange"
          size="sm"
          style={{ cursor: "pointer" }}
          leftSection={<IconLock size={12} />}
        >
          {t("Locked")}
        </Badge>
      </Popover.Target>
      <Popover.Dropdown>
        <Stack gap={6}>
          <Text size="sm" fw={500}>
            {lockedByMe
              ? t("Locked by you")
              : t("Locked by {{name}}", { name: lockedBy?.name ?? "…" })}
          </Text>
          <Text size="xs" c="dimmed">
            {t("Others can only view this page.")}
          </Text>
          {lockedAt && (
            <Text size="xs">
              {t("Locked at")}: {formattedDate(new Date(lockedAt))}
            </Text>
          )}
          {expiresAt && (
            <Text size="xs">
              {t("Unlocks automatically around")}: {formattedDate(expiresAt)}
            </Text>
          )}
          {canUnlock && (
            <Button
              size="xs"
              variant="default"
              mt={4}
              leftSection={<IconLockOpen size={14} />}
              loading={unlock.isPending}
              onClick={() => unlock.mutate()}
            >
              {t("Unlock page")}
            </Button>
          )}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}
