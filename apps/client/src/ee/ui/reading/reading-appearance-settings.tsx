import { Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ReadingAppearanceForm } from "./reading-appearance-form";

export function ReadingAppearanceSettings() {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <div>
        <Text size="md">{t("Reading appearance")}</Text>
        <Text size="sm" c="dimmed">
          {t(
            "Adjust the document's font and background for comfortable reading and writing.",
          )}
        </Text>
      </div>

      <ReadingAppearanceForm />
    </Stack>
  );
}
