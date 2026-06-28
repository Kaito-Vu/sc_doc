import { useEffect, useState } from "react";
import {
  Button,
  Group,
  Modal,
  Stack,
  TextInput,
  PasswordInput,
  NumberInput,
  Text,
  Alert,
  Loader,
  Center,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  getPlugin,
  getPluginConfig,
  updatePluginConfig,
  IPluginDetail,
  IPluginConfig,
} from "../services/plugin-service";

interface Props {
  pluginId: string;
  onClose: () => void;
  onSave: (options?: { silent?: boolean }) => Promise<void>;
}

export function PluginConfigModal({ pluginId, onClose, onSave }: Readonly<Props>) {
  const { t } = useTranslation();
  const [plugin, setPlugin] = useState<IPluginDetail | null>(null);
  const [config, setConfig] = useState<IPluginConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: {} as Record<string, any>,
    validate: validateForm,
  });

  function validateForm(values: Record<string, any>) {
    const errors: Record<string, string> = {};
    if (!plugin?.configSchema) return errors;

    const properties = plugin.configSchema.properties || {};
    for (const [key, schemaProp] of Object.entries(properties)) {
      const prop = schemaProp as any;
      if (prop.required && !values[key]) {
        errors[key] = `${prop.title || key} is required`;
      }
    }
    return errors;
  }

  useEffect(() => {
    loadData();
  }, [pluginId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [pluginData, configData] = await Promise.all([
        getPlugin(pluginId),
        getPluginConfig(pluginId),
      ]);
      setPlugin(pluginData);
      setConfig(configData);
      form.setValues(configData.config || {});
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err?.message || t("Failed to load plugin configuration"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (values: Record<string, any>) => {
    setSaving(true);
    try {
      setError(null);
      await updatePluginConfig(pluginId, { config: values });
      notifications.show({
        message: t("Configuration saved successfully"),
        color: "green",
      });
      await onSave({ silent: true });
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err?.message || t("Failed to save configuration"),
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Modal opened={true} onClose={onClose} title={t("Plugin Configuration")}>
        <Center py="xl">
          <Loader size="sm" />
        </Center>
      </Modal>
    );
  }

  if (!plugin || !plugin.configSchema) {
    return (
      <Modal opened={true} onClose={onClose} title={t("Plugin Configuration")}>
        <Alert color="red">{t("No configuration schema available")}</Alert>
      </Modal>
    );
  }

  const properties = plugin.configSchema.properties || {};
  const renderField = (key: string, prop: any) => {
    const label = prop.title || key;
    const description = prop.description;
    const isSecret = prop.isSecret || prop.format === "password";

    if (prop.type === "string") {
      if (isSecret) {
        return (
          <PasswordInput
            key={key}
            label={label}
            description={description}
            placeholder={prop.placeholder || ""}
            required={prop.required}
            {...form.getInputProps(key)}
          />
        );
      }
      return (
        <TextInput
          key={key}
          label={label}
          description={description}
          placeholder={prop.placeholder || ""}
          required={prop.required}
          {...form.getInputProps(key)}
        />
      );
    }

    if (prop.type === "number") {
      return (
        <NumberInput
          key={key}
          label={label}
          description={description}
          placeholder={prop.placeholder || ""}
          required={prop.required}
          min={prop.minimum}
          max={prop.maximum}
          step={prop.multipleOf || 1}
          {...form.getInputProps(key)}
        />
      );
    }

    return (
      <TextInput
        key={key}
        label={label}
        description={description}
        placeholder={prop.placeholder || ""}
        required={prop.required}
        {...form.getInputProps(key)}
      />
    );
  };

  return (
    <Modal
      opened={true}
      onClose={onClose}
      title={t("{{pluginName}} Configuration", { pluginName: plugin.name })}
      size="md"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          {error && <Alert color="red">{error}</Alert>}

          {plugin.configSchema.description && (
            <Text size="sm" c="dimmed">
              {plugin.configSchema.description}
            </Text>
          )}

          {Object.entries(properties).map(([key, prop]) => renderField(key, prop))}

          <Group justify="flex-end" mt="lg">
            <Button variant="default" onClick={onClose} disabled={saving}>
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={saving}>
              {t("Save Configuration")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
