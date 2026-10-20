import { Button, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";

export function DiscardConfirmPanel({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack gap="xs" p="sm">
      <Text size="sm" fw={600}>
        {t("Unsaved changes")}
      </Text>
      <Text size="xs" c="dimmed">
        {t("You have unsaved changes. Do you want to discard them?")}
      </Text>
      <Group gap="xs" justify="flex-end">
        <Button variant="default" size="xs" onClick={onKeepEditing}>
          {t("Keep editing")}
        </Button>
        <Button color="red" size="xs" onClick={onDiscard}>
          {t("Discard")}
        </Button>
      </Group>
    </Stack>
  );
}
