import { Group, Select, Switch, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom, useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { userAtom, workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  LOCALE_OPTIONS,
  updateWorkspaceLocale,
  WorkspaceLocaleSettings,
} from "./locale-settings";

export default function WorkspaceLanguageSetting() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const user = useAtomValue(userAtom);
  const settings = (workspace?.settings ?? {}) as WorkspaceLocaleSettings;
  const isAdmin = user?.role === "owner" || user?.role === "admin";

  const save = async (patch: WorkspaceLocaleSettings) => {
    if (!workspace) return;
    try {
      const next = await updateWorkspaceLocale(patch);
      setWorkspace({ ...workspace, settings: next });
    } catch (err) {
      notifications.show({
        message: getApiErrorMessage(err, t("Failed to update setting")),
        color: "red",
      });
    }
  };

  return (
    <>
      <Group justify="space-between" wrap="nowrap" gap="xl">
        <div>
          <Text size="md">{t("Default language")}</Text>
          <Text size="sm" c="dimmed">
            {t("Language new members start with.")}
          </Text>
        </div>
        <Select
          aria-label={t("Default language")}
          data={LOCALE_OPTIONS}
          value={settings.defaultLocale ?? "en-US"}
          onChange={(v) => v && save({ defaultLocale: v })}
          allowDeselect={false}
          disabled={!isAdmin}
          checkIconPosition="right"
        />
      </Group>

      <Group justify="space-between" wrap="nowrap" gap="xl" mt="md">
        <div>
          <Text size="md">{t("Force language for all users")}</Text>
          <Text size="sm" c="dimmed">
            {t(
              "Everyone sees the default language and cannot change it. Turn off to restore each member's own choice.",
            )}
          </Text>
        </div>
        <Switch
          aria-label={t("Force language for all users")}
          checked={!!settings.forceLocale}
          onChange={(e) =>
            save({
              forceLocale: e.currentTarget.checked,
              defaultLocale: settings.defaultLocale ?? "en-US",
            })
          }
          disabled={!isAdmin}
        />
      </Group>
    </>
  );
}
