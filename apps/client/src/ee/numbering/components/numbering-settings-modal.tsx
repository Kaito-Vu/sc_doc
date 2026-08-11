import { FC, useEffect, useRef, useState } from "react";
import { Button, Group, Modal, ScrollArea, Stack, Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_NUMBERING_SETTINGS,
  NumberingLevelConfig,
  NumberingSettings,
} from "@docmost/editor-ext";
import { NumberingLevelRow } from "./numbering-level-row";
import { useUpdateNumberingSettingsMutation } from "@/ee/numbering/queries/numbering-query";

interface Props {
  pageId: string;
  opened: boolean;
  onClose: () => void;
  numberingSettings: NumberingSettings | null;
}

export const NumberingSettingsModal: FC<Props> = ({
  pageId,
  opened,
  onClose,
  numberingSettings,
}) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<NumberingSettings>(
    numberingSettings ?? DEFAULT_NUMBERING_SETTINGS,
  );
  const updateMutation = useUpdateNumberingSettingsMutation();

  const prevOpenedRef = useRef(opened);
  useEffect(() => {
    if (opened && !prevOpenedRef.current) {
      setDraft(numberingSettings ?? DEFAULT_NUMBERING_SETTINGS);
    }
    prevOpenedRef.current = opened;
  }, [opened, numberingSettings]);

  const updateLevel = (index: number, config: NumberingLevelConfig) => {
    const levels = [...draft.levels];
    levels[index] = config;
    setDraft({ ...draft, levels: levels as NumberingSettings["levels"] });
  };

  const handleSave = () => {
    updateMutation.mutate(
      { pageId, numberingSettings: draft },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal opened={opened} onClose={onClose} title={t("Numbering settings")} size="lg">
      <Stack gap="sm">
        <Switch
          label={t("Enable numbering")}
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.currentTarget.checked })}
        />
        <Switch
          label={t("Link headings to numbering")}
          checked={draft.linkHeadingsToNumbering}
          onChange={(e) =>
            setDraft({ ...draft, linkHeadingsToNumbering: e.currentTarget.checked })
          }
        />
        <ScrollArea.Autosize mah={320}>
          <Stack gap="xs">
            {draft.levels.map((config, index) => (
              <NumberingLevelRow
                key={index}
                level={index + 1}
                config={config}
                onChange={(next) => updateLevel(index, next)}
              />
            ))}
          </Stack>
        </ScrollArea.Autosize>
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleSave} loading={updateMutation.isPending}>
            {t("Save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
