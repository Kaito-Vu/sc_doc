import { Container, Stack, Tabs, Card, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title";
import MinioSettings from "./minio";

export default function IntegrationsSettings() {
  const { t } = useTranslation();

  return (
    <Stack>
      <SettingsTitle title={t("Integrations")} />

      <Tabs defaultValue="minio">
        <Tabs.List>
          <Tabs.Tab value="minio">MinIO Storage</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="minio" pt="xl">
          <MinioSettings />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
