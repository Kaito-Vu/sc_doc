import { useEffect, useState } from "react";
import {
  Button,
  Divider,
  Fieldset,
  Group,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
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

interface ActionSettings {
  enabled: boolean;
  threshold: number;
}

const DEFAULT_LOGIN_ACTION: ActionSettings = { enabled: true, threshold: 0.5 };
const DEFAULT_SIGNUP_ACTION: ActionSettings = { enabled: true, threshold: 0.7 };

export default function RecaptchaSettings() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [siteKey, setSiteKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [hasStoredSecret, setHasStoredSecret] = useState(false);
  const [loginAction, setLoginAction] = useState<ActionSettings>(DEFAULT_LOGIN_ACTION);
  const [signupAction, setSignupAction] = useState<ActionSettings>(DEFAULT_SIGNUP_ACTION);

  const [initialSiteKey, setInitialSiteKey] = useState("");
  const [initialLoginAction, setInitialLoginAction] = useState<ActionSettings>(DEFAULT_LOGIN_ACTION);
  const [initialSignupAction, setInitialSignupAction] = useState<ActionSettings>(DEFAULT_SIGNUP_ACTION);

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
      const nextLoginAction: ActionSettings = {
        ...DEFAULT_LOGIN_ACTION,
        ...(config.actions?.login || {}),
      };
      const nextSignupAction: ActionSettings = {
        ...DEFAULT_SIGNUP_ACTION,
        ...(config.actions?.signup || {}),
      };

      setSiteKey(nextSiteKey);
      setInitialSiteKey(nextSiteKey);
      setSecretKey("");
      setHasStoredSecret(storedSecret || Boolean(config.secretKey));
      setLoginAction(nextLoginAction);
      setInitialLoginAction(nextLoginAction);
      setSignupAction(nextSignupAction);
      setInitialSignupAction(nextSignupAction);
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
      const config: Record<string, any> = {
        siteKey: siteKey.trim(),
        actions: {
          login: loginAction,
          signup: signupAction,
        },
      };

      if (secretKey.trim()) {
        config.secretKey = secretKey.trim();
      }

      await updatePluginConfig(RECAPTCHA_PLUGIN_ID, { config });
      clearRecaptchaConfigCache();
      setInitialSiteKey(siteKey.trim());
      setSecretKey("");
      setHasStoredSecret(true);
      setInitialLoginAction(loginAction);
      setInitialSignupAction(signupAction);

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
    siteKey.trim() !== initialSiteKey.trim() ||
    secretKey.trim().length > 0 ||
    JSON.stringify(loginAction) !== JSON.stringify(initialLoginAction) ||
    JSON.stringify(signupAction) !== JSON.stringify(initialSignupAction);

  return (
    <>
      <div>
        <Text size="md">{t("Google reCAPTCHA")}</Text>
        <Text size="sm" c="dimmed" mb="sm">
          {t(
            "Configure Google reCAPTCHA v3 credentials and enforcement used for login and signup protection.",
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

          <Fieldset legend={t("Login")} disabled={loading}>
            <Stack gap="sm">
              <Switch
                label={t("Verify reCAPTCHA on login")}
                checked={loginAction.enabled}
                onChange={(event) =>
                  setLoginAction((prev) => ({
                    ...prev,
                    enabled: event.currentTarget.checked,
                  }))
                }
              />
              <NumberInput
                label={t("Score threshold")}
                description={t("Minimum score to allow login (0-1)")}
                value={loginAction.threshold}
                onChange={(value) =>
                  setLoginAction((prev) => ({
                    ...prev,
                    threshold: typeof value === "number" ? value : prev.threshold,
                  }))
                }
                min={0}
                max={1}
                step={0.05}
                decimalScale={2}
                disabled={!loginAction.enabled}
              />
            </Stack>
          </Fieldset>

          <Fieldset legend={t("Signup")} disabled={loading}>
            <Stack gap="sm">
              <Switch
                label={t("Verify reCAPTCHA on signup")}
                checked={signupAction.enabled}
                onChange={(event) =>
                  setSignupAction((prev) => ({
                    ...prev,
                    enabled: event.currentTarget.checked,
                  }))
                }
              />
              <NumberInput
                label={t("Score threshold")}
                description={t("Minimum score to allow signup (0-1)")}
                value={signupAction.threshold}
                onChange={(value) =>
                  setSignupAction((prev) => ({
                    ...prev,
                    threshold: typeof value === "number" ? value : prev.threshold,
                  }))
                }
                min={0}
                max={1}
                step={0.05}
                decimalScale={2}
                disabled={!signupAction.enabled}
              />
            </Stack>
          </Fieldset>

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
