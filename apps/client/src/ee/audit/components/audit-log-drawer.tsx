import React from "react";
import {
  Badge,
  Box,
  Button,
  Code,
  CopyButton,
  Divider,
  Drawer,
  Grid,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconCopy,
  IconFingerprint,
  IconGlobe,
  IconId,
  IconInfoCircle,
  IconUser,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  getActorTypeLabel,
  getEventCategory,
  getEventLabel,
  getResourceTypeLabel,
} from "@/ee/audit/lib/audit-event-labels";
import { IAuditLog } from "@/ee/audit/types/audit.types";
import { formattedDate } from "@/lib/time";
import { CustomAvatar } from "@/components/ui/custom-avatar";

type AuditLogDrawerProps = {
  opened: boolean;
  onClose: () => void;
  log?: IAuditLog;
  isLoading: boolean;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <ThemeIcon variant="light" color="gray" size={30} radius="md">
        <Icon size={15} />
      </ThemeIcon>
      <div style={{ minWidth: 0 }}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
          {label}
        </Text>
        <Box mt={2}>{children}</Box>
      </div>
    </Group>
  );
}

function ChangesTable({ changes }: { changes: IAuditLog["changes"] }) {
  const { t } = useTranslation();
  if (!changes) return null;

  const before = changes.before ?? {};
  const after = changes.after ?? {};
  const keys = Array.from(
    new Set([...Object.keys(before), ...Object.keys(after)]),
  ).sort();

  if (keys.length === 0) return null;

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        {t("What changed")}
      </Text>
      <Table withTableBorder withColumnBorders verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={160}>{t("Field")}</Table.Th>
            <Table.Th>{t("Before")}</Table.Th>
            <Table.Th>{t("After")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {keys.map((key) => {
            const beforeValue = formatValue(before[key]);
            const afterValue = formatValue(after[key]);
            const changed = beforeValue !== afterValue;
            return (
              <Table.Tr key={key}>
                <Table.Td>
                  <Code>{key}</Code>
                </Table.Td>
                <Table.Td>
                  <Text
                    size="xs"
                    c={changed ? "red.7" : "dimmed"}
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {beforeValue}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text
                    size="xs"
                    c={changed ? "green.7" : "dimmed"}
                    style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
                  >
                    {afterValue}
                  </Text>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

export function AuditLogDrawer({
  opened,
  onClose,
  log,
  isLoading,
}: AuditLogDrawerProps) {
  const { t } = useTranslation();
  const category = log ? getEventCategory(log.event) : undefined;
  const raw = log ? JSON.stringify(log, null, 2) : "";

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      title={t("Audit event details")}
      overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
    >
      {isLoading ? (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      ) : !log ? (
        <Text c="dimmed" ta="center" py="xl">
          {t("This audit event could not be loaded.")}
        </Text>
      ) : (
        <Stack gap="lg">
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Badge
                  variant="light"
                  color={category?.color}
                  radius="sm"
                  tt="none"
                  mb={6}
                >
                  {t(getEventLabel(log.event))}
                </Badge>
                <Text size="xs" c="dimmed" ff="monospace">
                  {log.event}
                </Text>
                <Text size="sm" mt={6}>
                  {formattedDate(new Date(log.createdAt))}
                </Text>
              </div>
              <CopyButton value={raw} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? t("Copied") : t("Copy JSON")}>
                    <Button
                      variant="default"
                      size="compact-sm"
                      leftSection={
                        copied ? (
                          <IconCheck size={14} />
                        ) : (
                          <IconCopy size={14} />
                        )
                      }
                      onClick={copy}
                    >
                      {copied ? t("Copied") : t("Copy JSON")}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
          </Paper>

          <Grid>
            <Grid.Col span={12}>
              <Field icon={IconUser} label={t("Actor")}>
                {log.actor ? (
                  <Group gap="sm" wrap="nowrap">
                    <CustomAvatar
                      avatarUrl={log.actor.avatarUrl}
                      name={log.actor.name}
                      size={30}
                    />
                    <div>
                      <Text size="sm" fw={500}>
                        {log.actor.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {log.actor.email}
                      </Text>
                    </div>
                  </Group>
                ) : (
                  <Text size="sm">{t(getActorTypeLabel(log.actorType))}</Text>
                )}
                <Badge size="xs" variant="default" mt={4} tt="none">
                  {t(getActorTypeLabel(log.actorType))}
                </Badge>
              </Field>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Field icon={IconInfoCircle} label={t("Resource")}>
                <Text size="sm">
                  {t(getResourceTypeLabel(log.resourceType))}
                  {log.resource?.name ? ` · ${log.resource.name}` : ""}
                </Text>
                {log.resourceId && (
                  <Text size="xs" c="dimmed" ff="monospace">
                    {log.resourceId}
                  </Text>
                )}
              </Field>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Field icon={IconGlobe} label={t("IP address")}>
                <Text size="sm" ff="monospace">
                  {log.ipAddress ?? "—"}
                </Text>
              </Field>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Field icon={IconId} label={t("Space")}>
                <Text size="sm" ff="monospace">
                  {log.spaceId ?? "—"}
                </Text>
              </Field>
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 6 }}>
              <Field icon={IconFingerprint} label={t("Event ID")}>
                <Text size="sm" ff="monospace">
                  {log.id}
                </Text>
              </Field>
            </Grid.Col>

            <Grid.Col span={12}>
              <Field icon={IconGlobe} label={t("User agent")}>
                <Text size="xs" c="dimmed" style={{ wordBreak: "break-word" }}>
                  {log.userAgent ?? "—"}
                </Text>
              </Field>
            </Grid.Col>
          </Grid>

          {log.changes && (
            <>
              <Divider />
              <ChangesTable changes={log.changes} />
            </>
          )}

          {log.metadata && Object.keys(log.metadata).length > 0 && (
            <>
              <Divider />
              <Stack gap="xs">
                <Text fw={600} size="sm">
                  {t("Metadata")}
                </Text>
                <Paper withBorder p="sm" radius="md">
                  <Stack gap={6}>
                    {Object.entries(log.metadata).map(([key, value]) => (
                      <Group
                        key={key}
                        gap="sm"
                        align="flex-start"
                        wrap="nowrap"
                      >
                        <Code style={{ flex: "0 0 130px" }}>{key}</Code>
                        <Text
                          size="xs"
                          style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                          }}
                        >
                          {formatValue(value)}
                        </Text>
                      </Group>
                    ))}
                  </Stack>
                </Paper>
              </Stack>
            </>
          )}

          <Divider />
          <Stack gap="xs">
            <Text fw={600} size="sm">
              {t("Raw record")}
            </Text>
            <ScrollArea.Autosize mah={320} type="auto">
              <Code block style={{ whiteSpace: "pre-wrap" }}>
                {raw}
              </Code>
            </ScrollArea.Autosize>
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}
