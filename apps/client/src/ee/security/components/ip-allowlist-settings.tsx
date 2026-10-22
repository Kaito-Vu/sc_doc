import { useEffect, useState } from "react";
import { Button, Divider, Stack, Switch, TagsInput, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  getPluginConfig,
  getPlugins,
  updatePluginConfig,
} from "@/ee/plugins/services/plugin-service";

const PLUGIN_ID = "ip-allowlist";
const IP_OR_CIDR = /^([0-9a-f:.]+)(\/\d{1,3})?$/i;

export default function IpAllowlistSettings() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [allowedIps, setAllowedIps] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const plugins = await getPlugins();
        if (!plugins.some((p) => p.id === PLUGIN_ID)) return;
        setAvailable(true);
        const data = await getPluginConfig(PLUGIN_ID);
        setEnabled(Boolean(data?.enabled));
        const ips = data?.config?.allowedIps;
        setAllowedIps(Array.isArray(ips) ? ips : []);
      } catch (err) {
        notifications.show({
          message: getApiErrorMessage(err, t("Failed to load settings")),
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await updatePluginConfig(PLUGIN_ID, { enabled, config: { allowedIps } });
      notifications.show({ message: t("Settings saved"), color: "green" });
    } catch (err) {
      notifications.show({
        message: getApiErrorMessage(err, t("Failed to save settings")),
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!available) return null;

  return (
    <>
      <div>
        <Text size="md">{t("IP allowlist")}</Text>
        <Text size="sm" c="dimmed" mb="sm">
          {t(
            "Only allow sign-in from the addresses below. An empty list allows every IP. Make sure your own IP is included before enabling.",
          )}
        </Text>
        <Stack gap="sm" maw={480}>
          <Switch
            label={t("IP allowlist")}
            checked={enabled}
            onChange={(e) => setEnabled(e.currentTarget.checked)}
            disabled={loading}
          />
          <TagsInput
            label={t("Allowed IPs / CIDR ranges")}
            description={t("e.g. 203.0.113.5 or 10.0.0.0/8")}
            value={allowedIps}
            onChange={(v) => setAllowedIps(v.filter((x) => IP_OR_CIDR.test(x)))}
            maxTags={100}
            disabled={loading}
          />
          <Button onClick={save} loading={saving} disabled={loading} w="fit-content">
            {t("Save")}
          </Button>
        </Stack>
      </div>
      <Divider my="lg" />
    </>
  );
}
