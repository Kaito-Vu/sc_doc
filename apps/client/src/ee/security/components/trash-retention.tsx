import { useState, useEffect } from "react";
import {
  Group,
  Text,
  NumberInput,
  Select,
  Button,
  Tooltip,
} from "@mantine/core";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useTranslation } from "react-i18next";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { notifications } from "@mantine/notifications";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label.ts";
import {
  daysToRetention,
  retentionToDays,
  RetentionUnit,
} from "@/ee/lib/retention";

const DEFAULT_RETENTION_DAYS = 30;

export default function TrashRetention() {
  const { t } = useTranslation();
  const hasRetention = useHasFeature(Feature.RETENTION);
  const upgradeLabel = useUpgradeLabel();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);

  const currentDays = workspace?.trashRetentionDays ?? DEFAULT_RETENTION_DAYS;
  const parsed = daysToRetention(currentDays);

  const [retentionAmount, setRetentionAmount] = useState<number | string>(
    parsed.amount,
  );
  const [retentionUnit, setRetentionUnit] = useState<RetentionUnit>(
    parsed.unit,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const days = workspace?.trashRetentionDays ?? DEFAULT_RETENTION_DAYS;
    const { amount, unit } = daysToRetention(days);
    setRetentionAmount(amount);
    setRetentionUnit(unit);
  }, [workspace?.trashRetentionDays]);

  const handleSave = async () => {
    const num = typeof retentionAmount === "number" ? retentionAmount : 1;
    const clamped = Math.max(1, num);
    setRetentionAmount(clamped);
    const days = retentionToDays(clamped, retentionUnit);

    if (days === currentDays) return;

    setSaving(true);
    try {
      const updatedWorkspace = await updateWorkspace({
        trashRetentionDays: days,
      });
      setWorkspace(updatedWorkspace);
      notifications.show({
        message: t("Trash retention updated"),
      });
    } catch (err: any) {
      notifications.show({
        message:
          err?.response?.data?.message || t("Failed to update trash retention"),
        color: "red",
      });
      const { amount, unit } = daysToRetention(currentDays);
      setRetentionAmount(amount);
      setRetentionUnit(unit);
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    retentionToDays(
      typeof retentionAmount === "number" ? retentionAmount : 1,
      retentionUnit,
    ) !== currentDays;

  return (
    <div>
      <Text size="md">{t("Trash retention")}</Text>
      <Text size="sm" c="dimmed" mb="sm">
        {t("Pages in trash will be permanently deleted after this period.")}
      </Text>

      <Tooltip label={upgradeLabel} disabled={hasRetention}>
        <Group gap="xs" wrap="nowrap" maw={320}>
          <NumberInput
            value={retentionAmount}
            onChange={(val) => setRetentionAmount(val)}
            min={1}
            hideControls
            size="sm"
            w={60}
            disabled={!hasRetention}
          />
          <Select
            data={[
              { value: "days", label: t("days") },
              { value: "months", label: t("months") },
              { value: "years", label: t("years") },
            ]}
            value={retentionUnit}
            onChange={(value) => {
              if (value === "days" || value === "months" || value === "years") {
                setRetentionUnit(value);
              }
            }}
            size="sm"
            style={{ flex: 1 }}
            disabled={!hasRetention}
          />
          <Button
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={!hasRetention || !isDirty}
          >
            {t("Save")}
          </Button>
        </Group>
      </Tooltip>
    </div>
  );
}
