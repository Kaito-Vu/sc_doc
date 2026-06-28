import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getPlugin,
  getPluginConfig,
  updatePluginConfig,
  IPluginDetail,
} from "../services/plugin-service";

interface Props {
  pluginId: string;
  onClose: () => void;
  onSave: () => void;
}

export function PluginConfigModal({
  pluginId,
  onClose,
  onSave,
}: Readonly<Props>) {
  const { t } = useTranslation();
  const [plugin, setPlugin] = useState<IPluginDetail | null>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPluginConfig();
  }, [pluginId]);

  const loadPluginConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const [pluginData, configData] = await Promise.all([
        getPlugin(pluginId),
        getPluginConfig(pluginId),
      ]);

      setPlugin(pluginData);
      setConfig(configData?.config || {});
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          t("Failed to load configuration"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      await updatePluginConfig(pluginId, { config });

      notifications.show({
        message: t("Plugin configuration saved"),
        color: "green",
      });
      onSave();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || t("Save failed"));
    } finally {
      setSaving(false);
    }
  };

  const renderConfigFields = () => {
    if (loading) {
      return (
        <Group justify="center" py="xl">
          <Loader size="sm" />
        </Group>
      );
    }

    if (!plugin?.configSchema?.properties) {
      return (
        <Text ta="center" c="dimmed" py="lg">
          {t("No configuration available")}
        </Text>
      );
    }

    return (
      <Stack gap="md">
        {Object.entries(plugin.configSchema.properties).map(
          ([key, prop]: [string, any]) => (
            <div key={key}>
              {prop.type === "string" && !prop.enum && (
                <TextInput
                  label={prop.title || key}
                  description={prop.description}
                  required={prop.required}
                  type={
                    key.includes("secret") || key.includes("password")
                      ? "password"
                      : "text"
                  }
                  value={config[key] || ""}
                  onChange={(e) =>
                    setConfig({ ...config, [key]: e.target.value })
                  }
                  placeholder={prop.placeholder || ""}
                />
              )}

              {prop.type === "number" && (
                <NumberInput
                  label={prop.title || key}
                  description={prop.description}
                  required={prop.required}
                  value={config[key]}
                  onChange={(value) =>
                    setConfig({ ...config, [key]: value })
                  }
                />
              )}

              {prop.type === "boolean" && (
                <Checkbox
                  label={prop.title || key}
                  description={prop.description}
                  checked={config[key] || false}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      [key]: e.currentTarget.checked,
                    })
                  }
                />
              )}

              {prop.enum && (
                <Select
                  label={prop.title || key}
                  description={prop.description}
                  required={prop.required}
                  value={config[key] || ""}
                  onChange={(value) =>
                    setConfig({ ...config, [key]: value })
                  }
                  data={[
                    { value: "", label: t("Select...") },
                    ...prop.enum.map((opt: string) => ({
                      value: opt,
                      label: opt,
                    })),
                  ]}
                  allowDeselect={false}
                />
              )}
            </div>
          ),
        )}
      </Stack>
    );
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={plugin?.name || t("Configure Plugin")}
      size="md"
      centered
    >
      {plugin?.description && (
        <Text size="sm" c="dimmed" mb="md">
          {plugin.description}
        </Text>
      )}

      {error && (
        <Alert color="red" mb="md">
          {error}
        </Alert>
      )}

      {renderConfigFields()}

      <Group justify="flex-end" mt="xl">
        <Button variant="default" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button onClick={handleSave} loading={saving} disabled={loading}>
          {t("Save")}
        </Button>
      </Group>
    </Modal>
  );
}
