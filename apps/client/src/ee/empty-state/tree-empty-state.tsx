import { useState } from "react";
import { Button, Group, Stack, Text } from "@mantine/core";
import { IconFileImport, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import PageImportModal from "@/features/page/components/page-import-modal.tsx";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";

/** Empty page tree: tell the user why it is empty and what to do next. */
export function TreeEmptyState({
  spaceId,
  readOnly,
}: {
  spaceId: string;
  readOnly?: boolean;
}) {
  const { t } = useTranslation();
  const { handleCreate } = useTreeMutation(spaceId);
  const [importing, setImporting] = useState(false);

  if (readOnly) {
    return (
      <Text size="xs" c="dimmed" py="xs" px="sm">
        {t("No pages yet. You have view-only access to this space.")}
      </Text>
    );
  }

  return (
    <Stack gap="xs" py="sm" px="sm">
      <Text size="xs" c="dimmed">
        {t("No pages yet")}
      </Text>
      <Group gap="xs">
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={() => handleCreate(null)}
        >
          {t("Create your first page")}
        </Button>
        <Button
          size="compact-xs"
          variant="default"
          leftSection={<IconFileImport size={14} />}
          onClick={() => setImporting(true)}
        >
          {t("Import pages")}
        </Button>
      </Group>
      <PageImportModal
        spaceId={spaceId}
        open={importing}
        onClose={() => setImporting(false)}
      />
    </Stack>
  );
}
