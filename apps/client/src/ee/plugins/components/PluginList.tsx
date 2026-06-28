import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Card,
  Center,
  Group,
  Loader,
  Menu,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  ThemeIcon,
} from "@mantine/core";
import {
  IconDots,
  IconPuzzle,
  IconSettings,
  IconShieldCheck,
} from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { IPlugin, togglePlugin } from "../services/plugin-service";

interface Props {
  plugins: IPlugin[];
  loading: boolean;
  onRefresh: (options?: { silent?: boolean }) => Promise<void>;
  onConfigClick?: (pluginId: string) => void;
}

function getPluginIcon(pluginId: string) {
  if (pluginId === "recaptcha") {
    return IconShieldCheck;
  }
  return IconPuzzle;
}

export function PluginList({
  plugins,
  loading,
  onRefresh,
  onConfigClick,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const [toggling, setToggling] = useState<string | null>(null);

  const handleToggle = async (plugin: IPlugin, enabled: boolean) => {
    setToggling(plugin.id);
    try {
      console.log(`[Toggle] Starting toggle for ${plugin.id} to ${enabled}`);
      const toggleResponse = await togglePlugin(plugin.id, enabled);
      console.log(`[Toggle] Toggle response:`, toggleResponse);

      // Small delay to ensure database write completes
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log(`[Toggle] Calling onRefresh...`);
      await onRefresh({ silent: true });
      console.log(`[Toggle] Refresh completed`);

      notifications.show({
        message: t("Plugin toggled successfully"),
        color: "green",
      });
    } catch (err: any) {
      console.error(`[Toggle] Error:`, err);
      notifications.show({
        message:
          err?.response?.data?.message || err?.message || t("Unknown error"),
        color: "red",
      });
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <Center py="xl">
        <Loader size="sm" />
      </Center>
    );
  }

  if (plugins.length === 0) {
    return (
      <Card withBorder radius="md" padding="xl">
        <Text ta="center" c="dimmed">
          {t("No plugins available")}
        </Text>
      </Card>
    );
  }

  return (
    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
      {plugins.map((plugin) => {
        const PluginIcon = getPluginIcon(plugin.id);
        const isToggling = toggling === plugin.id;
        const hasConfig = !!plugin.configSchema;

        return (
          <Card
            key={plugin.id}
            withBorder
            radius="md"
            padding="lg"
            shadow="xs"
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: 200,
            }}
          >
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Group gap="md" align="flex-start" wrap="nowrap" style={{ flex: 1 }}>
                <ThemeIcon
                  size={44}
                  radius="md"
                  variant="light"
                  color={plugin.enabled ? "blue" : "gray"}
                >
                  <PluginIcon size={24} stroke={1.5} />
                </ThemeIcon>

                <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                  <Text fw={600} size="sm" lineClamp={1}>
                    {plugin.name}
                  </Text>
                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {plugin.description}
                  </Text>
                </Stack>
              </Group>

              <Group gap={4} wrap="nowrap">
                <Switch
                  checked={plugin.enabled}
                  onChange={(e) => handleToggle(plugin, e.currentTarget.checked)}
                  disabled={isToggling}
                  size="md"
                  aria-label={
                    plugin.enabled
                      ? t("Disable {{name}}", { name: plugin.name })
                      : t("Enable {{name}}", { name: plugin.name })
                  }
                />

                {hasConfig && onConfigClick && (
                  <Menu position="bottom-end" withinPortal>
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label={t("Plugin options")}
                      >
                        <IconDots size={18} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconSettings size={16} />}
                        onClick={() => onConfigClick(plugin.id)}
                      >
                        {t("Configure")}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                )}
              </Group>
            </Group>

            {plugin.enabled && !plugin.configured && hasConfig && (
              <div style={{ marginTop: "auto", paddingTop: "12px" }}>
                <Badge
                  size="sm"
                  variant="dot"
                  color="yellow"
                  style={{ cursor: "pointer" }}
                  onClick={() => onConfigClick?.(plugin.id)}
                >
                  {t("Needs configuration")}
                </Badge>
              </div>
            )}

            <Group gap={6} mt="auto" pt="md">
              <Text size="xs" c="dimmed">
                v{plugin.version} · {plugin.author}
              </Text>
              {plugin.configured && (
                <Badge size="xs" variant="light" color="blue">
                  {t("Configured")}
                </Badge>
              )}
              <Badge
                size="xs"
                variant="light"
                color={plugin.enabled ? "green" : "gray"}
              >
                {plugin.enabled ? t("Enabled") : t("Disabled")}
              </Badge>
            </Group>
          </Card>
        );
      })}
    </SimpleGrid>
  );
}
