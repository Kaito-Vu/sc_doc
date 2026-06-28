import { useEffect, useState } from "react";
import { Button, Divider, Group, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getPluginConfig,
  getPlugins,
  updatePluginConfig,
} from "@/ee/plugins/services/plugin-service";
import { clearRecaptchaConfigCache } from "@/ee/plugins/recaptcha/services/recaptcha-config.service";

const RECAPTCHA_PLUGIN_ID = "recaptcha";
const REDACTED_SECRET = "***REDACTED***";

export default function RecaptchaSettings() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteKey, setSiteKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [hasStoredSecret, setHasStoredSecret] = useState(false);
  const [initialSiteKey, setInitialSiteKey] = useState("");

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const plugins = await getPlugins();
      const recaptcha = plugins.find((plugin) => plugin.id === RECAPTCHA_PLUGIN_ID);

      if (!recaptcha?.enabled) {
        setVisible(false);
        return;
      }

      setVisible(true);
      const configData = await getPluginConfig(RECAPTCHA_PLUGIN_ID);
      const config = configData.config || {};
      const nextSiteKey = config.siteKey || "";
      const storedSecret = config.secretKey === REDACTED_SECRET;

      setSiteKey(nextSiteKey);
      setInitialSiteKey(nextSiteKey);
      setSecretKey("");
      setHasStoredSecret(storedSecret || Boolean(config.secretKey));
    } catch (err: any) {
      notifications.show({
        message:
          err?.response?.data?.message ||
          err?.message ||
          t("Failed to load reCAPTCHA settings"),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!siteKey.trim()) {
      notifications.show({
        message: t("Site key is required"),
        color: "red",
      });
      return;
    }

    if (!hasStoredSecret && !secretKey.trim()) {
      notifications.show({
        message: t("Secret key is required"),
        color: "red",
      });
      return;
    }

    setSaving(true);
    try {
      const config: Record<string, string> = {
        siteKey: siteKey.trim(),
      };

      if (secretKey.trim()) {
        config.secretKey = secretKey.trim();
      }

      await updatePluginConfig(RECAPTCHA_PLUGIN_ID, { config });
      clearRecaptchaConfigCache();
      setInitialSiteKey(siteKey.trim());
      setSecretKey("");
      setHasStoredSecret(true);

      notifications.show({
        message: t("reCAPTCHA settings saved"),
        color: "green",
      });
    } catch (err: any) {
      notifications.show({
        message:
          err?.response?.data?.message ||
          err?.message ||
          t("Failed to save reCAPTCHA settings"),
        color: "red",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!visible) {
    return null;
  }

  const isDirty =
    siteKey.trim() !== initialSiteKey.trim() || secretKey.trim().length > 0;

  return (
    <>
      <div>
        <Text size="md">{t("Google reCAPTCHA")}</Text>
        <Text size="sm" c="dimmed" mb="sm">
          {t(
            "Configure Google reCAPTCHA v3 credentials used for login and signup protection.",
          )}
        </Text>

        <Stack gap="sm" maw={480}>
          <TextInput
            label={t("Site key")}
            description={t("Public site key from Google reCAPTCHA admin console")}
            value={siteKey}
            onChange={(event) => setSiteKey(event.currentTarget.value)}
            disabled={loading}
            required
          />

          <TextInput
            label={t("Secret key")}
            description={
              hasStoredSecret && !secretKey
                ? t("A secret key is already saved. Enter a new value to replace it.")
                : t("Secret key from Google reCAPTCHA admin console")
            }
            type="password"
            value={secretKey}
            onChange={(event) => setSecretKey(event.currentTarget.value)}
            disabled={loading}
            placeholder={hasStoredSecret ? "••••••••" : undefined}
            required={!hasStoredSecret}
          />

          <Group justify="flex-start">
            <Button
              size="sm"
              onClick={handleSave}
              loading={saving}
              disabled={loading || !isDirty}
            >
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </div>
      <Divider my="lg" />
    </>
  );
}
