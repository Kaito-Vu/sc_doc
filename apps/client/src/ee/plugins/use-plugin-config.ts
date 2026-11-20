import { useEffect, useState } from "react";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  getPluginConfig,
  getPlugins,
  IPluginConfig,
  updatePluginConfig,
} from "./services/plugin-service";

// Load/save plumbing shared by plugin settings forms.
// `config` is null until loaded; forms copy it into local edit state.
// `available` is false when the plugin is not installed on this server.
export function usePluginConfig(pluginId: string) {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [config, setConfig] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plugins = await getPlugins();
        if (!plugins.some((p) => p.id === pluginId)) return;
        const data = await getPluginConfig(pluginId);
        if (cancelled) return;
        setAvailable(true);
        setEnabled(Boolean(data?.enabled));
        setConfig(data?.config ?? {});
      } catch (err) {
        if (cancelled) return;
        notifications.show({
          message: getApiErrorMessage(err, t("Failed to load settings")),
          color: "red",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId]);

  // Saves `next` (+ current enabled) and shows the toast. Returns the stored
  // config on success, null on failure.
  const save = async (
    next: Record<string, any>,
  ): Promise<IPluginConfig | null> => {
    setSaving(true);
    try {
      const updated = await updatePluginConfig(pluginId, {
        enabled,
        config: next,
      });
      notifications.show({ message: t("Settings saved"), color: "green" });
      return updated;
    } catch (err) {
      notifications.show({
        message: getApiErrorMessage(err, t("Failed to save settings")),
        color: "red",
      });
      return null;
    } finally {
      setSaving(false);
    }
  };

  return { available, loading, saving, enabled, setEnabled, config, save };
}
