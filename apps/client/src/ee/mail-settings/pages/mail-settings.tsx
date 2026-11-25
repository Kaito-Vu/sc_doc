import { useEffect, useState } from "react";
import {
  Button,
  Divider,
  Group,
  NumberInput,
  PasswordInput,
  Stack,
  Switch,
  TextInput,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  useMailSettingsQuery,
  useResetMailSettingsMutation,
  useSendTestMailMutation,
  useUpdateMailSettingsMutation,
} from "@/ee/mail-settings/queries/mail-settings-query";

export default function MailSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { data } = useMailSettingsQuery();
  const update = useUpdateMailSettingsMutation();
  const reset = useResetMailSettingsMutation();
  const test = useSendTestMailMutation();

  const [form, setForm] = useState({
    fromAddress: "",
    fromName: "Docmost",
    host: "",
    port: 587 as number | string,
    username: "",
    secure: false,
    ignoreTLS: false,
  });
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (!data) return;
    const { configured, hasPassword, ...rest } = data;
    setForm(rest);
    setPassword("");
  }, [data]);

  if (!isAdmin) return null;

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const valid = !!form.host && !!form.fromAddress && Number(form.port) > 0;

  const save = () =>
    update.mutate({
      ...form,
      port: Number(form.port),
      // empty field keeps the stored password
      password: password || undefined,
    });

  return (
    <>
      <DocumentTitle title={t("Email (SMTP)")} />
      <SettingsTitle title={t("Email (SMTP)")} />

      <Stack gap="md" maw={640}>
        <TextInput
          label={t("SMTP host")}
          value={form.host}
          onChange={(e) => set({ host: e.currentTarget.value })}
        />
        <NumberInput
          label={t("SMTP port")}
          min={1}
          max={65535}
          allowDecimal={false}
          value={form.port}
          onChange={(v) => set({ port: v })}
        />
        <TextInput
          label={t("SMTP username")}
          value={form.username}
          onChange={(e) => set({ username: e.currentTarget.value })}
        />
        <PasswordInput
          label={t("SMTP password")}
          description={
            data?.hasPassword
              ? t("A password is saved. Leave empty to keep it.")
              : undefined
          }
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        <Switch
          label={t("Use TLS (secure)")}
          checked={form.secure}
          onChange={(e) => set({ secure: e.currentTarget.checked })}
        />
        <Switch
          label={t("Ignore TLS")}
          checked={form.ignoreTLS}
          onChange={(e) => set({ ignoreTLS: e.currentTarget.checked })}
        />
        <TextInput
          label={t("From address")}
          value={form.fromAddress}
          onChange={(e) => set({ fromAddress: e.currentTarget.value })}
        />
        <TextInput
          label={t("From name")}
          value={form.fromName}
          onChange={(e) => set({ fromName: e.currentTarget.value })}
        />

        <Group>
          <Button onClick={save} disabled={!valid} loading={update.isPending}>
            {t("Save")}
          </Button>
          {data?.hasPassword && (
            <Button
              variant="default"
              onClick={() => update.mutate({ ...form, port: Number(form.port), password: null })}
              disabled={update.isPending}
            >
              {t("Remove password")}
            </Button>
          )}
          <Button
            variant="default"
            onClick={() => reset.mutate(undefined)}
            disabled={!data?.configured || reset.isPending}
          >
            {t("Reset to default")}
          </Button>
        </Group>

        <Divider />

        <Group align="flex-end">
          <TextInput
            style={{ flex: 1 }}
            label={t("Send test email to")}
            value={testTo}
            onChange={(e) => setTestTo(e.currentTarget.value)}
          />
          <Button
            variant="default"
            onClick={() => test.mutate(testTo)}
            disabled={!data?.configured || !testTo}
            loading={test.isPending}
          >
            {t("Send test")}
          </Button>
        </Group>
      </Stack>
    </>
  );
}
