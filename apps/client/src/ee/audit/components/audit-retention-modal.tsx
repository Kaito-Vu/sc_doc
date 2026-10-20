import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Text,
} from "@mantine/core";
import { IconInfoCircle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  daysToRetention,
  MIN_RETENTION_DAYS,
  retentionToDays,
  RetentionUnit,
} from "@/ee/lib/retention";
import {
  useAuditRetentionQuery,
  useUpdateAuditRetentionMutation,
} from "@/ee/audit/queries/audit-query";

type AuditRetentionModalProps = {
  opened: boolean;
  onClose: () => void;
};

export function AuditRetentionModal({
  opened,
  onClose,
}: AuditRetentionModalProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useAuditRetentionQuery();
  const updateRetention = useUpdateAuditRetentionMutation();

  const currentDays = data?.retentionDays ?? 90;
  const parsed = daysToRetention(currentDays);
  const [amount, setAmount] = useState<number | string>(parsed.amount);
  const [unit, setUnit] = useState<RetentionUnit>(parsed.unit);

  useEffect(() => {
    if (!opened || !data) return;
    const next = daysToRetention(data.retentionDays);
    setAmount(next.amount);
    setUnit(next.unit);
  }, [opened, data?.retentionDays]);

  const handleSave = () => {
    const numeric = typeof amount === "number" ? amount : 1;
    const clamped = Math.max(1, Math.round(numeric));
    updateRetention.mutate(
      {
        auditRetentionDays: Math.max(
          MIN_RETENTION_DAYS,
          retentionToDays(clamped, unit),
        ),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Audit retention")}
      centered
    >
      <Alert
        variant="light"
        color="blue"
        icon={<IconInfoCircle size={16} />}
        mb="md"
      >
        {t(
          "Audit logs older than this period are deleted automatically once a day. Exported copies are unaffected.",
        )}
      </Alert>

      <Text size="sm" mb={4}>
        {t("Keep audit logs for")}
      </Text>
      <Group gap="xs" wrap="nowrap" align="flex-end">
        <NumberInput
          value={amount}
          onChange={(value) =>
            setAmount(
              typeof value === "number"
                ? value
                : value === ""
                  ? ""
                  : Number(value),
            )
          }
          min={1}
          hideControls
          w={90}
          disabled={isLoading}
        />
        <Select
          data={[
            { value: "days", label: t("days") },
            { value: "months", label: t("months") },
            { value: "years", label: t("years") },
          ]}
          value={unit}
          onChange={(value) => {
            if (value === "days" || value === "months" || value === "years") {
              setUnit(value);
            }
          }}
          style={{ flex: 1 }}
          disabled={isLoading}
        />
      </Group>

      <Text size="xs" c="dimmed" mt="xs">
        {t("Currently keeping {{days}} day(s).", { days: currentDays })}
      </Text>
      <Text size="xs" c="dimmed">
        {t("Minimum retention is {{days}} days.", { days: MIN_RETENTION_DAYS })}
      </Text>

      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button onClick={handleSave} loading={updateRetention.isPending}>
          {t("Save changes")}
        </Button>
      </Group>
    </Modal>
  );
}
