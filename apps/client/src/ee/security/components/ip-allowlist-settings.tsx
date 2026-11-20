import { useEffect, useState } from "react";
import { Button, Divider, Stack, Switch, TagsInput, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePluginConfig } from "@/ee/plugins/use-plugin-config";

const PLUGIN_ID = "ip-allowlist";
const IP_OR_CIDR = /^([0-9a-f:.]+)(\/\d{1,3})?$/i;

export default function IpAllowlistSettings() {
  const { t } = useTranslation();
  const { available, loading, saving, enabled, setEnabled, config, save } =
    usePluginConfig(PLUGIN_ID);
  const [allowedIps, setAllowedIps] = useState<string[]>([]);

  useEffect(() => {
    const ips = config?.allowedIps;
    setAllowedIps(Array.isArray(ips) ? ips : []);
  }, [config]);

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
          <Button onClick={() => save({ allowedIps })} loading={saving} disabled={loading} w="fit-content">
            {t("Save")}
          </Button>
        </Stack>
      </div>
      <Divider my="lg" />
    </>
  );
}
