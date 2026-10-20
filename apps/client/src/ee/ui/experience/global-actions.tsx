import { ActionIcon, Button, Group, Tooltip } from "@mantine/core";
import { IconCommand, IconPlus } from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import {
  commandPaletteOpenedAtom,
  quickCreateOpenedAtom,
} from "./atoms";

export function GlobalActions() {
  const { t } = useTranslation();
  const setQuickCreateOpened = useSetAtom(quickCreateOpenedAtom);
  const setCommandPaletteOpened = useSetAtom(commandPaletteOpenedAtom);

  return (
    <Group gap={6} wrap="nowrap">
      <Button
        size="xs"
        leftSection={<IconPlus size={15} />}
        onClick={() => setQuickCreateOpened(true)}
        visibleFrom="sm"
      >
        {t("New")}
      </Button>
      <Tooltip label={t("New document")} withArrow>
        <ActionIcon
          variant="subtle"
          color="dark"
          size="sm"
          hiddenFrom="sm"
          aria-label={t("New document")}
          onClick={() => setQuickCreateOpened(true)}
        >
          <IconPlus size={20} stroke={2} />
        </ActionIcon>
      </Tooltip>
      <Tooltip label={t("Command palette")} withArrow>
        <ActionIcon
          variant="subtle"
          color="dark"
          size="sm"
          visibleFrom="sm"
          aria-label={t("Command palette")}
          onClick={() => setCommandPaletteOpened(true)}
        >
          <IconCommand size={20} stroke={2} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
