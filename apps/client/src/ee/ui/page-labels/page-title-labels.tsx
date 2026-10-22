import { useState } from "react";
import clsx from "clsx";
import { Popover } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { LabelChip } from "@/features/label/components/label-chip.tsx";
import { LabelPicker } from "@/features/label/components/label-picker.tsx";
import {
  useAddLabelsMutation,
  usePageLabelsQuery,
  useRemoveLabelMutation,
} from "@/features/label/queries/label-query.ts";
import classes from "@/features/label/label.module.css";

type Props = { pageId: string; canEdit: boolean };

/** Confluence-style label row shown directly under the page title. */
export function PageTitleLabels({ pageId, canEdit }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data } = usePageLabelsQuery(pageId);
  const addMutation = useAddLabelsMutation(pageId);
  const removeMutation = useRemoveLabelMutation(pageId);
  const labels = data?.items ?? [];

  if (!canEdit && labels.length === 0) return null;

  return (
    <div className={clsx(classes.labelsWrap, "print-hide")} style={{ marginBottom: 12 }}>
      {labels.map((label) => (
        <LabelChip
          key={label.id}
          label={label}
          asLink
          onRemove={
            canEdit
              ? () => removeMutation.mutate({ pageId, labelId: label.id })
              : undefined
          }
        />
      ))}
      {canEdit && (
        <Popover
          opened={open}
          onChange={setOpen}
          position="bottom-start"
          shadow="lg"
          withinPortal
          offset={6}
        >
          <Popover.Target>
            <button
              type="button"
              className={clsx(classes.addBtn, open && classes.addBtnOpen)}
              onClick={() => setOpen((v) => !v)}
            >
              <IconPlus size={12} stroke={2} />
              <span>{labels.length === 0 ? t("Add label") : t("Add")}</span>
            </button>
          </Popover.Target>
          <Popover.Dropdown p={0} className={classes.popover}>
            <LabelPicker
              applied={labels}
              enabled={open}
              onAdd={(name) => addMutation.mutate({ pageId, names: [name] })}
              onClose={() => setOpen(false)}
            />
          </Popover.Dropdown>
        </Popover>
      )}
    </div>
  );
}
