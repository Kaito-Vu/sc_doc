import { useEffect, useState } from "react";
import {
  Button,
  Fieldset,
  Group,
  Modal,
  Stack,
  Switch,
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
} from "../services/plugin-service";

// Matches PluginsController.redactSecrets() on the backend. A secret field
// still holding this placeholder means the admin never touched it, so it
// must be stripped from the submitted payload instead of overwriting the
// real stored secret with the literal placeholder string.
const REDACTED_PLACEHOLDER = "***REDACTED***";

interface Props {
  pluginId: string;
  onClose: () => void;
  onSave: (options?: { silent?: boolean }) => Promise<void>;
}

function isObjectSchema(prop: any): boolean {
  return prop?.type === "object" && prop?.properties;
}

function buildDefaults(schema: Record<string, any> | undefined): Record<string, any> {
  if (!schema?.properties) return {};
  const defaults: Record<string, any> = {};
  for (const [key, propDef] of Object.entries<any>(schema.properties)) {
    if (isObjectSchema(propDef)) {
      defaults[key] = buildDefaults(propDef);
    } else if (propDef.default !== undefined) {
      defaults[key] = propDef.default;
    }
  }
  return defaults;
}

function deepMerge(base: Record<string, any>, override: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object"
    ) {
      result[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

function validateSchema(
  schema: Record<string, any> | undefined,
  values: Record<string, any>,
  pathPrefix: string[] = [],
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!schema?.properties) return errors;

  for (const [key, propDef] of Object.entries<any>(schema.properties)) {
    const path = [...pathPrefix, key];
    if (isObjectSchema(propDef)) {
      Object.assign(errors, validateSchema(propDef, values?.[key] || {}, path));
    } else if (propDef.required && !values?.[key]) {
      errors[path.join(".")] = `${propDef.title || key} is required`;
    }
  }
  return errors;
}

// Walks the schema alongside the submitted values and deletes any
// isSecret field still equal to the redaction placeholder, so an
// untouched secret field never overwrites the real stored value.
function stripUntouchedSecrets(
  schema: Record<string, any> | undefined,
  values: Record<string, any>,
): Record<string, any> {
  if (!schema?.properties) return values;
  const cleaned: Record<string, any> = { ...values };

  for (const [key, propDef] of Object.entries<any>(schema.properties)) {
    if (isObjectSchema(propDef)) {
      if (cleaned[key]) {
        cleaned[key] = stripUntouchedSecrets(propDef, cleaned[key]);
      }
    } else if (propDef.isSecret && cleaned[key] === REDACTED_PLACEHOLDER) {
      delete cleaned[key];
    }
  }
  return cleaned;
}

export function PluginConfigModal({ pluginId, onClose, onSave }: Readonly<Props>) {
  const { t } = useTranslation();
  const [plugin, setPlugin] = useState<IPluginDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<Record<string, any>>({
    initialValues: {},
    validate: (values) => validateSchema(plugin?.configSchema, values),
  });

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
      const defaults = buildDefaults(pluginData.configSchema);
      form.setValues(deepMerge(defaults, configData.config || {}));
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
      const payload = stripUntouchedSecrets(plugin?.configSchema, values);
      await updatePluginConfig(pluginId, { config: payload });
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

  if (!plugin?.configSchema) {
    return (
      <Modal opened={true} onClose={onClose} title={t("Plugin Configuration")}>
        <Alert color="red">{t("No configuration schema available")}</Alert>
      </Modal>
    );
  }

  const renderField = (path: string, prop: any) => {
    const label = prop.title || path;
    const description = prop.description;
    const isSecret = prop.isSecret || prop.format === "password";

    if (isObjectSchema(prop)) {
      return (
        <Fieldset key={path} legend={label}>
          <Stack gap="sm">
            {description && (
              <Text size="xs" c="dimmed">
                {description}
              </Text>
            )}
            {Object.entries<any>(prop.properties).map(([childKey, childProp]) =>
              renderField(`${path}.${childKey}`, childProp),
            )}
          </Stack>
        </Fieldset>
      );
    }

    if (prop.type === "boolean") {
      return (
        <Switch
          key={path}
          label={label}
          description={description}
          {...form.getInputProps(path, { type: "checkbox" })}
        />
      );
    }

    if (prop.type === "string") {
      if (isSecret) {
        return (
          <PasswordInput
            key={path}
            label={label}
            description={description}
            placeholder={prop.placeholder || ""}
            required={prop.required}
            {...form.getInputProps(path)}
          />
        );
      }
      return (
        <TextInput
          key={path}
          label={label}
          description={description}
          placeholder={prop.placeholder || ""}
          required={prop.required}
          {...form.getInputProps(path)}
        />
      );
    }

    if (prop.type === "number") {
      return (
        <NumberInput
          key={path}
          label={label}
          description={description}
          placeholder={prop.placeholder || ""}
          required={prop.required}
          min={prop.minimum}
          max={prop.maximum}
          step={prop.multipleOf || 1}
          {...form.getInputProps(path)}
        />
      );
    }

    return (
      <TextInput
        key={path}
        label={label}
        description={description}
        placeholder={prop.placeholder || ""}
        required={prop.required}
        {...form.getInputProps(path)}
      />
    );
  };

  const properties = plugin.configSchema.properties || {};

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

          {Object.entries<any>(properties).map(([key, prop]) => renderField(key, prop))}

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
