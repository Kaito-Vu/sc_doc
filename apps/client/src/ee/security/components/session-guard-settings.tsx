import { useEffect, useState } from "react";
import {
  Button,
  Divider,
  Group,
  MultiSelect,
  NumberInput,
  Stack,
  Switch,
  TagsInput,
  Text,
} from "@mantine/core";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query.ts";
import { useGetGroupsQuery } from "@/features/group/queries/group-query.ts";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  getPluginConfig,
  getPlugins,
  updatePluginConfig,
} from "@/ee/plugins/services/plugin-service";

const SESSION_GUARD_PLUGIN_ID = "session-guard";
const DEFAULT_GRACE_SECONDS = 10;
const MIN_GRACE_SECONDS = 5;
const MAX_GRACE_SECONDS = 60;

const IP_OR_CIDR = /^([0-9a-f:.]+)(\/\d{1,3})?$/i;
const ROLES = ["owner", "admin", "member"];

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];

function clampGraceSeconds(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_GRACE_SECONDS;
  return Math.min(
    MAX_GRACE_SECONDS,
    Math.max(MIN_GRACE_SECONDS, Math.round(parsed)),
  );
}

export default function SessionGuardSettings() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [exemptUserIds, setExemptUserIds] = useState<string[]>([]);
  const [exemptGroupIds, setExemptGroupIds] = useState<string[]>([]);
  const [exemptRoles, setExemptRoles] = useState<string[]>([]);
  const [trustedIps, setTrustedIps] = useState<string[]>([]);
  const { data: members } = useWorkspaceMembersQuery({ limit: 100 });
  const { data: groups } = useGetGroupsQuery({ limit: 100 });
  const [graceSeconds, setGraceSeconds] = useState<number | string>(
    DEFAULT_GRACE_SECONDS,
  );

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        setLoading(true);
        const plugins = await getPlugins();
        const plugin = plugins.find(
          (candidate) => candidate.id === SESSION_GUARD_PLUGIN_ID,
        );
        if (!plugin) {
          if (!cancelled) setAvailable(false);
          return;
        }
        setAvailable(true);

        const configData = await getPluginConfig(SESSION_GUARD_PLUGIN_ID);
        if (cancelled) return;

        const config = configData?.config ?? {};
        setEnabled(Boolean(configData?.enabled ?? plugin?.enabled));
        setGraceSeconds(clampGraceSeconds(config.graceSeconds));
        setExemptUserIds(asStrings(config.exemptUserIds));
        setExemptGroupIds(asStrings(config.exemptGroupIds));
        setExemptRoles(asStrings(config.exemptRoles));
        setTrustedIps(asStrings(config.trustedIps));
      } catch (err) {
        if (cancelled) return;
        notifications.show({
          message: getApiErrorMessage(err, t("Failed to load settings")),
          color: "red",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    const nextGraceSeconds = clampGraceSeconds(graceSeconds);
    setSaving(true);
    try {
      const updated = await updatePluginConfig(SESSION_GUARD_PLUGIN_ID, {
        enabled,
        config: {
          graceSeconds: nextGraceSeconds,
          exemptUserIds,
          exemptGroupIds,
          exemptRoles,
          trustedIps,
        },
      });
      setEnabled(Boolean(updated?.enabled ?? enabled));
      setGraceSeconds(
        clampGraceSeconds(updated?.config?.graceSeconds ?? nextGraceSeconds),
      );
      notifications.show({
        message: t("Settings saved"),
        color: "green",
      });
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
        <Text size="md">{t("Single-session IP guard")}</Text>
        <Text size="sm" c="dimmed" mb="sm">
          {t(
            "Users can only stay signed in from one IP at a time. Signing in from another IP notifies both sessions; the older session signs out after the grace period unless it rejects the new login.",
          )}
        </Text>

        <Stack gap="sm" maw={480}>
          <Switch
            label={t("Single-session IP guard")}
            description={t("Only one IP per user")}
            checked={enabled}
            onChange={(event) => setEnabled(event.currentTarget.checked)}
            disabled={loading}
          />

          <NumberInput
            label={t("Grace period (seconds)")}
            value={graceSeconds}
            onChange={(value) =>
              setGraceSeconds(value === "" ? "" : Number(value))
            }
            min={MIN_GRACE_SECONDS}
            max={MAX_GRACE_SECONDS}
            step={1}
            disabled={loading}
          />

          <Text size="sm" fw={500} mt="xs">
            {t("Exceptions")}
          </Text>
          <MultiSelect
            label={t("Exempt users")}
            data={(members?.items ?? []).map((u) => ({
              value: u.id,
              label: u.name,
            }))}
            value={exemptUserIds}
            onChange={setExemptUserIds}
            searchable
            clearable
            disabled={loading}
          />
          <MultiSelect
            label={t("Exempt groups")}
            data={(groups?.items ?? []).map((g) => ({
              value: g.id,
              label: g.name,
            }))}
            value={exemptGroupIds}
            onChange={setExemptGroupIds}
            searchable
            clearable
            disabled={loading}
          />
          <MultiSelect
            label={t("Exempt roles")}
            data={ROLES.map((r) => ({ value: r, label: t(r) }))}
            value={exemptRoles}
            onChange={setExemptRoles}
            disabled={loading}
          />
          <TagsInput
            label={t("Trusted IPs / CIDR ranges")}
            description={t(
              "Logins from these addresses never trigger the guard, e.g. 203.0.113.5 or 10.0.0.0/8",
            )}
            value={trustedIps}
            onChange={(value) =>
              setTrustedIps(value.filter((v) => IP_OR_CIDR.test(v)))
            }
            maxTags={100}
            disabled={loading}
          />

          <Group justify="flex-start">
            <Button onClick={handleSave} loading={saving} disabled={loading}>
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </div>
      <Divider my="lg" />
    </>
  );
}
