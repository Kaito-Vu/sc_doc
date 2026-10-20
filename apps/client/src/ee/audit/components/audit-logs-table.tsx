import {
  Anchor,
  Badge,
  Box,
  Center,
  Group,
  Paper,
  Skeleton,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  IconChevronRight,
  IconHistory,
  IconSearchOff,
} from "@tabler/icons-react";
import { IAuditLog } from "@/ee/audit/types/audit.types";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import {
  getActorTypeLabel,
  getEventCategory,
  getEventLabel,
  getResourceTypeLabel,
} from "@/ee/audit/lib/audit-event-labels";
import { buildPageUrl } from "@/features/page/page.utils";
import { formattedDate, shortTimeAgo } from "@/lib/time";
import classes from "./audit-logs.module.css";

type AuditLogsTableProps = {
  items?: IAuditLog[];
  isLoading: boolean;
  onSelect: (entry: IAuditLog) => void;
  hasFilters?: boolean;
  onClearFilters?: () => void;
};

function getResourceUrl(entry: IAuditLog): string | null {
  const resource = entry.resource;
  if (!resource) return null;

  switch (entry.resourceType) {
    case "page":
      return resource.slugId
        ? buildPageUrl(resource.spaceSlug, resource.slugId, resource.name)
        : null;
    case "group":
      return `/settings/groups/${resource.id}`;
    case "space":
    case "space_member":
    case "personal_space":
      return resource.slug ? `/s/${resource.slug}` : null;
    default:
      return null;
  }
}

function ActorCell({ entry }: { entry: IAuditLog }) {
  const { t } = useTranslation();

  if (entry.actor) {
    return (
      <Group gap="sm" wrap="nowrap">
        <CustomAvatar
          avatarUrl={entry.actor.avatarUrl}
          name={entry.actor.name}
          size={34}
        />
        <div style={{ minWidth: 0 }}>
          <Text fz="sm" fw={500} lineClamp={1}>
            {entry.actor.name}
          </Text>
          <Text fz="xs" c="dimmed" lineClamp={1}>
            {entry.actor.email}
          </Text>
        </div>
      </Group>
    );
  }

  return (
    <Group gap="xs" wrap="nowrap">
      <ThemeIcon size={30} radius="xl" variant="light" color="gray">
        <IconHistory size={15} />
      </ThemeIcon>
      <div>
        <Text fz="sm" fw={500}>
          {t(getActorTypeLabel(entry.actorType))}
        </Text>
        {entry.actorType !== "user" && (
          <Text fz="xs" c="dimmed">
            {entry.actorId ?? t("No actor")}
          </Text>
        )}
      </div>
    </Group>
  );
}

function ResourceCell({ entry }: { entry: IAuditLog }) {
  const { t } = useTranslation();
  const url = getResourceUrl(entry);

  if (!entry.resource?.name && !entry.resourceId) {
    return (
      <Text fz="sm" c="dimmed">
        —
      </Text>
    );
  }

  const name = entry.resource?.name ?? entry.resourceId;
  const typeLabel = t(getResourceTypeLabel(entry.resourceType));

  return (
    <div style={{ minWidth: 0 }}>
      <Text fz="xs" c="dimmed">
        {typeLabel}
      </Text>
      {url ? (
        <Anchor
          size="sm"
          fw={500}
          underline="never"
          component={Link}
          to={url}
          className={classes.resourceLinkText}
          onClick={(event) => event.stopPropagation()}
        >
          <Text fz="sm" fw={500} lineClamp={1} component="span">
            {name}
          </Text>
        </Anchor>
      ) : (
        <Text fz="sm" lineClamp={1}>
          {name}
        </Text>
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, index) => (
        <Table.Tr key={index}>
          <Table.Td>
            <Skeleton height={12} width={90} />
          </Table.Td>
          <Table.Td>
            <Group gap="sm" wrap="nowrap">
              <Skeleton circle height={34} />
              <div>
                <Skeleton height={12} width={110} mb={5} />
                <Skeleton height={9} width={150} />
              </div>
            </Group>
          </Table.Td>
          <Table.Td>
            <Skeleton height={20} width={150} radius="sm" />
          </Table.Td>
          <Table.Td>
            <Skeleton height={12} width={130} />
          </Table.Td>
          <Table.Td>
            <Skeleton height={12} width={90} />
          </Table.Td>
          <Table.Td>
            <Skeleton height={12} width={16} />
          </Table.Td>
        </Table.Tr>
      ))}
    </>
  );
}

export default function AuditLogsTable({
  items,
  isLoading,
  onSelect,
  hasFilters,
  onClearFilters,
}: AuditLogsTableProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder radius="md" className={classes.tableCard}>
      <Table.ScrollContainer minWidth={860}>
        <Table
          highlightOnHover
          verticalSpacing="sm"
          horizontalSpacing="md"
          className={classes.table}
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={130}>{t("When")}</Table.Th>
              <Table.Th w={240}>{t("Actor")}</Table.Th>
              <Table.Th>{t("Action")}</Table.Th>
              <Table.Th w={190}>{t("Resource")}</Table.Th>
              <Table.Th w={140}>{t("IP address")}</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {isLoading ? (
              <TableSkeleton />
            ) : items && items.length > 0 ? (
              items.map((entry) => {
                const category = getEventCategory(entry.event);
                return (
                  <Table.Tr
                    key={entry.id}
                    onClick={() => onSelect(entry)}
                    style={{ cursor: "pointer" }}
                    className={classes.row}
                  >
                    <Table.Td>
                      <Tooltip
                        label={formattedDate(new Date(entry.createdAt))}
                        position="top"
                        withArrow
                      >
                        <Box>
                          <Text
                            fz="sm"
                            fw={500}
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {shortTimeAgo(new Date(entry.createdAt))}
                          </Text>
                          <Text
                            fz="xs"
                            c="dimmed"
                            style={{ whiteSpace: "nowrap" }}
                          >
                            {new Date(entry.createdAt).toLocaleTimeString(
                              undefined,
                              { hour: "2-digit", minute: "2-digit" },
                            )}
                          </Text>
                        </Box>
                      </Tooltip>
                    </Table.Td>

                    <Table.Td>
                      <ActorCell entry={entry} />
                    </Table.Td>

                    <Table.Td>
                      <Group gap={6} wrap="nowrap">
                        <Badge
                          size="sm"
                          radius="sm"
                          variant="light"
                          color={category.color}
                          tt="none"
                        >
                          {t(getEventLabel(entry.event))}
                        </Badge>
                        {entry.metadata && (
                          <Tooltip label={t("Has metadata")}>
                            <Badge
                              size="xs"
                              variant="default"
                              radius="sm"
                              tt="none"
                            >
                              +info
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                    </Table.Td>

                    <Table.Td>
                      <ResourceCell entry={entry} />
                    </Table.Td>

                    <Table.Td>
                      <Text fz="xs" c="dimmed" ff="monospace">
                        {entry.ipAddress ?? "—"}
                      </Text>
                    </Table.Td>

                    <Table.Td>
                      <IconChevronRight
                        size={16}
                        color="var(--mantine-color-dimmed)"
                      />
                    </Table.Td>
                  </Table.Tr>
                );
              })
            ) : (
              <Table.Tr>
                <Table.Td colSpan={6}>
                  <Center py={48}>
                    <Stack align="center" gap="xs" maw={360}>
                      <ThemeIcon
                        size={48}
                        radius="xl"
                        variant="light"
                        color="gray"
                      >
                        <IconSearchOff size={24} />
                      </ThemeIcon>
                      <Text fw={600}>{t("No audit events found")}</Text>
                      <Text size="sm" c="dimmed" ta="center">
                        {hasFilters
                          ? t("Try a wider date range or remove some filters.")
                          : t(
                              "Events will appear here as people work in the workspace.",
                            )}
                      </Text>
                      {hasFilters && onClearFilters && (
                        <Anchor
                          component="button"
                          type="button"
                          size="sm"
                          onClick={onClearFilters}
                        >
                          {t("Clear all filters")}
                        </Anchor>
                      )}
                    </Stack>
                  </Center>
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}
