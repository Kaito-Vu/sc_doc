import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Alert, Button, Group, Text } from "@mantine/core";
import { IconRefresh } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { getAppName } from "@/lib/config";
import SettingsTitle from "@/components/settings/settings-title";
import { PluginList } from "../components/PluginList";
import { PluginConfigModal } from "../components/PluginConfigModal";
import { getPlugins, IPlugin } from "../services/plugin-service";

export default function PluginsPage() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<IPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);
      console.log(`[LoadPlugins] Fetching plugins...`, { silent: options?.silent });
      const data = await getPlugins();
      console.log(`[LoadPlugins] Received data (count: ${data?.length}):`, data);

      // Debug each plugin's enabled state
      if (data) {
        data.forEach(p => {
          console.log(`  - ${p.id}: enabled=${p.enabled}, configured=${p.configured}`);
        });
      }

      setPlugins(data || []);
      console.log(`[LoadPlugins] State setPlugins called with ${data?.length} plugins`);
    } catch (err: any) {
      console.error(`[LoadPlugins] Error:`, err);
      setError(
        err?.response?.data?.message || err?.message || t("Failed to load plugins"),
      );
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  };

  const handleManualRefresh = async () => {
    try {
      setRefreshing(true);
      setError(null);
      const data = await getPlugins();
      setPlugins(data || []);
      notifications.show({
        message: t("Plugins refreshed"),
        color: "green",
      });
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err?.message || t("Failed to load plugins"),
      );
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t("Plugins")} - {getAppName()}</title>
      </Helmet>

      <SettingsTitle title={t("Plugins")} />

      <Group justify="space-between" align="flex-start" mb="lg" wrap="nowrap">
        <Text size="sm" c="dimmed" maw="75%">
          {t(
            "Enable or disable plugins that extend authentication, security, and other workspace features.",
          )}
        </Text>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          loading={refreshing}
          onClick={handleManualRefresh}
        >
          {t("Refresh")}
        </Button>
      </Group>

      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}

      <PluginList
        plugins={plugins}
        loading={loading}
        onRefresh={loadPlugins}
        onConfigClick={setSelectedPluginId}
      />

      {selectedPluginId && (
        <PluginConfigModal
          pluginId={selectedPluginId}
          onClose={() => setSelectedPluginId(null)}
          onSave={loadPlugins}
        />
      )}
    </>
  );
}
