import { Group, Text, Select } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { updateUser } from "../services/user-service";
import { useAtom } from "jotai";
import { userAtom } from "../atoms/current-user-atom";
import { useState } from "react";
import { useLocaleForced } from "@/ee/workspace-locale/use-workspace-locale";
import { LOCALE_OPTIONS, normalizeLocale } from "@/lib/locales";

export default function AccountLanguage() {
  const { t } = useTranslation();

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{t("Language")}</Text>
        <Text size="sm" c="dimmed">
          {t("Choose your preferred interface language.")}
        </Text>
      </div>
      <LanguageSwitcher />
    </Group>
  );
}

function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const forced = useLocaleForced();
  const [user, setUser] = useAtom(userAtom);
  const [language, setLanguage] = useState(normalizeLocale(user?.locale));

  const handleChange = async (value: string) => {
    const locale = normalizeLocale(value);
    const updatedUser = await updateUser({ locale });

    setLanguage(locale);
    setUser(updatedUser);

    i18n.changeLanguage(locale);
  };

  return (
    <Select
      label={t("Select language")}
      data={LOCALE_OPTIONS}
      value={language}
      onChange={handleChange}
      allowDeselect={false}
      disabled={forced}
      checkIconPosition="right"
    />
  );
}
