import { useEffect } from "react";
import {
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Switch,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useTranslation } from "react-i18next";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query";
import { useDocMetadataQuery, useUpdateDocMetadataMutation } from "@/ee/docs";
import { DOC_CLASSIFICATIONS } from "@/ee/docs/types";

type DocMetadataModalProps = {
  pageId: string;
  opened: boolean;
  onClose: () => void;
};

type FormValues = {
  ownerId: string | null;
  reviewerId: string | null;
  classification: string | null;
  docType: string;
  effectiveAt: string;
  reviewDueAt: string;
  notes: string;
  archived: boolean;
};

function toDateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toIsoOrNull(value: string): string | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function DocMetadataModal({
  pageId,
  opened,
  onClose,
}: DocMetadataModalProps) {
  const { t } = useTranslation();
  const { data } = useDocMetadataQuery(opened ? pageId : undefined);
  const { data: members } = useWorkspaceMembersQuery({ limit: 100 });
  const updateMutation = useUpdateDocMetadataMutation(pageId);

  const form = useForm<FormValues>({
    initialValues: {
      ownerId: null,
      reviewerId: null,
      classification: null,
      docType: "",
      effectiveAt: "",
      reviewDueAt: "",
      notes: "",
      archived: false,
    },
  });

  useEffect(() => {
    if (!opened || !data) return;
    form.setValues({
      ownerId: data.ownerId,
      reviewerId: data.reviewerId,
      classification: data.classification,
      docType: data.docType ?? "",
      effectiveAt: toDateInput(data.effectiveAt),
      reviewDueAt: toDateInput(data.reviewDueAt),
      notes: data.notes ?? "",
      archived: !!data.archivedAt,
    });
    form.resetDirty();
  }, [opened, data]);

  const memberOptions =
    members?.items?.map((member) => ({
      value: member.id,
      label: member.name,
    })) ?? [];

  const handleSave = form.onSubmit(async (values) => {
    try {
      await updateMutation.mutateAsync({
        pageId,
        ownerId: values.ownerId,
        reviewerId: values.reviewerId,
        classification: values.classification as
          | (typeof DOC_CLASSIFICATIONS)[number]["value"]
          | null,
        docType: values.docType,
        effectiveAt: toIsoOrNull(values.effectiveAt),
        reviewDueAt: toIsoOrNull(values.reviewDueAt),
        notes: values.notes,
        archivedAt: values.archived
          ? data?.archivedAt ?? new Date().toISOString()
          : null,
      });
      onClose();
    } catch {
      // notification handled by the mutation
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Document metadata")}
      size={560}
      centered
    >
      <form onSubmit={handleSave}>
        <Stack gap="md">
          <Select
            label={t("Owner")}
            placeholder={t("Unassigned")}
            data={memberOptions}
            clearable
            searchable
            data-autofocus
            {...form.getInputProps("ownerId")}
          />

          <Select
            label={t("Reviewer")}
            placeholder={t("Unassigned")}
            data={memberOptions}
            clearable
            searchable
            {...form.getInputProps("reviewerId")}
          />

          <Select
            label={t("Classification")}
            placeholder={t("Unclassified")}
            data={DOC_CLASSIFICATIONS.map((item) => ({
              value: item.value,
              label: t(item.label),
            }))}
            clearable
            {...form.getInputProps("classification")}
          />

          <TextInput
            label={t("Document type")}
            placeholder={t("e.g. Policy, SOP, Decision record")}
            {...form.getInputProps("docType")}
          />

          <Group grow>
            <TextInput
              label={t("Effective date")}
              type="date"
              {...form.getInputProps("effectiveAt")}
            />
            <TextInput
              label={t("Review due")}
              type="date"
              {...form.getInputProps("reviewDueAt")}
            />
          </Group>

          <Textarea
            label={t("Notes")}
            minRows={3}
            maxRows={6}
            {...form.getInputProps("notes")}
          />

          <Switch
            label={t("Archived")}
            description={t(
              "Archived documents stay readable but are hidden from active views.",
            )}
            checked={form.values.archived}
            onChange={(event) =>
              form.setFieldValue("archived", event.currentTarget.checked)
            }
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" loading={updateMutation.isPending}>
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
