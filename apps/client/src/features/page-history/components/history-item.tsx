import {
  Text,
  Group,
  UnstyledButton,
  Avatar,
  Tooltip,
  Badge,
  Menu,
  ActionIcon,
} from "@mantine/core";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import classes from "./css/history.module.css";
import clsx from "clsx";
import { IPageHistory } from "@/features/page-history/types/page.types";
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { IconDots } from "@tabler/icons-react";

const MAX_VISIBLE_AVATARS = 5;

function formatTime(date: Date) {
  return date
    .toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    .replace(" ", "");
}

interface HistoryItemProps {
  historyItem: IPageHistory;
  index: number;
  onSelect: (id: string, index: number) => void;
  onHover?: (id: string, index: number) => void;
  onHoverEnd?: () => void;
  isActive: boolean;
  canRestore?: boolean;
  onView?: (id: string) => void;
  onCompareWithCurrent?: (id: string) => void;
  onStartComparePick?: (id: string) => void;
  isPickSource?: boolean;
  isPickTarget?: boolean;
}

const HistoryItem = memo(function HistoryItem({
  historyItem,
  index,
  onSelect,
  onHover,
  onHoverEnd,
  isActive,
  canRestore,
  onView,
  onCompareWithCurrent,
  onStartComparePick,
  isPickSource,
  isPickTarget,
}: HistoryItemProps) {
  const { t } = useTranslation();

  const handleClick = useCallback(() => {
    onSelect(historyItem.id, index);
  }, [onSelect, historyItem.id, index]);

  const handleMouseEnter = useCallback(() => {
    onHover?.(historyItem.id, index);
  }, [onHover, historyItem.id, index]);

  const contributors = historyItem.contributors;
  const hasContributors = contributors && contributors.length > 0;
  const createdAt = new Date(historyItem.createdAt);

  return (
    <UnstyledButton
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onHoverEnd}
      className={clsx(classes.timelineRow, {
        [classes.active]: isActive,
        [classes.pickSource]: isPickSource,
        [classes.pickTarget]: isPickTarget,
      })}
    >
      <div className={classes.timelineRail}>
        <span
          className={clsx(classes.timelineDot, {
            [classes.timelineDotActive]: isActive,
          })}
        />
      </div>

      <div className={classes.timelineContent}>
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Group gap={6} wrap="nowrap">
            <Text size="sm">{formatTime(createdAt)}</Text>
            {historyItem.isCurrent && (
              <Badge variant="filled" color="violet" size="xs" radius="sm">
                {t("Current")}
              </Badge>
            )}
          </Group>

          <Group gap={4} wrap="nowrap">
            {historyItem.contentHash && (
              <Badge
                variant="light"
                color="gray"
                size="xs"
                radius="sm"
                style={{ fontFamily: "monospace" }}
              >
                {historyItem.contentHash}
              </Badge>
            )}

            {!historyItem.isCurrent &&
              (onView || onCompareWithCurrent || onStartComparePick || canRestore) && (
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <IconDots size={14} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    {onView && (
                      <Menu.Item onClick={() => onView(historyItem.id)}>
                        {t("View this revision")}
                      </Menu.Item>
                    )}
                    {onCompareWithCurrent && (
                      <Menu.Item
                        onClick={() => onCompareWithCurrent(historyItem.id)}
                      >
                        {t("Compare with current")}
                      </Menu.Item>
                    )}
                    {onStartComparePick && (
                      <Menu.Item
                        onClick={() => onStartComparePick(historyItem.id)}
                      >
                        {t("Compare with...")}
                      </Menu.Item>
                    )}
                  </Menu.Dropdown>
                </Menu>
              )}
          </Group>
        </Group>

        <Group gap={6} wrap="nowrap" mt={4}>
          {hasContributors ? (
            <>
              <Tooltip.Group openDelay={300} closeDelay={100}>
                <Avatar.Group spacing={8}>
                  {contributors.slice(0, MAX_VISIBLE_AVATARS).map((contributor) => (
                    <Tooltip key={contributor.id} label={contributor.name} withArrow>
                      <CustomAvatar
                        size="sm"
                        avatarUrl={contributor.avatarUrl}
                        name={contributor.name}
                      />
                    </Tooltip>
                  ))}
                  {contributors.length > MAX_VISIBLE_AVATARS && (
                    <Tooltip
                      withArrow
                      label={contributors.slice(MAX_VISIBLE_AVATARS).map((c) => (
                        <div key={c.id}>{c.name}</div>
                      ))}
                    >
                      <Avatar size="sm" color="gray">
                        +{contributors.length - MAX_VISIBLE_AVATARS}
                      </Avatar>
                    </Tooltip>
                  )}
                </Avatar.Group>
              </Tooltip.Group>
              {contributors.length === 1 && (
                <Text size="sm" c="dimmed" lineClamp={1}>
                  {contributors[0].name}
                </Text>
              )}
            </>
          ) : !historyItem.isCurrent ? (
            <>
              <CustomAvatar
                size="sm"
                avatarUrl={historyItem.lastUpdatedBy?.avatarUrl}
                name={historyItem.lastUpdatedBy?.name}
              />
              <Text size="sm" c="dimmed" lineClamp={1}>
                {historyItem.lastUpdatedBy?.name}
              </Text>
            </>
          ) : null}
        </Group>

        {historyItem.isCurrent && (
          <Text size="xs" c="dimmed" fs="italic" mt={4}>
            {t("Add note...")}
          </Text>
        )}
      </div>
    </UnstyledButton>
  );
});

export default HistoryItem;
