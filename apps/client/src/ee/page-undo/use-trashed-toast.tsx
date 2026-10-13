import { Button, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { useRestorePageMutation } from "@/features/page/queries/page-query.ts";

/** "Moved to trash" toast with an Undo button that restores the page. */
export function useTrashedToast() {
  const { t } = useTranslation();
  const restore = useRestorePageMutation();

  return (pageId: string) => {
    const id = `trashed-${pageId}`;
    notifications.show({
      id,
      autoClose: 8000,
      message: (
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">{t("Page moved to trash")}</Text>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => {
              notifications.hide(id);
              restore.mutate(pageId);
            }}
          >
            {t("Undo")}
          </Button>
        </Group>
      ),
    });
  };
}
