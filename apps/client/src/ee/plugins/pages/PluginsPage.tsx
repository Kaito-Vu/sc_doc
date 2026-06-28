import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Alert, Text } from "@mantine/core";
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
  const [error, setError] = useState<string | null>(null);
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getPlugins();
      setPlugins(data || []);
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err?.message || t("Failed to load plugins"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{t("Plugins")} - {getAppName()}</title>
      </Helmet>

      <SettingsTitle title={t("Plugins")} />

      <Text size="sm" c="dimmed" mb="lg">
        {t(
          "Manage plugins that extend authentication, security, and other workspace features.",
        )}
      </Text>

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
