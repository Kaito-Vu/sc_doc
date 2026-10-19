import { memo, useMemo } from "react";
import { Checkbox, Tooltip } from "@mantine/core";
import { useRowSelection } from "@/ee/base/hooks/use-row-selection";
import classes from "@/ee/base/styles/grid.module.css";
import { useTranslation } from "react-i18next";

type RowNumberHeaderCellProps = {
  loadedRowIds: string[];
  pageId: string;
};

export const RowNumberHeaderCell = memo(function RowNumberHeaderCell({
  loadedRowIds,
  pageId,
}: RowNumberHeaderCellProps) {
  const { t } = useTranslation();
  const { selectedIds, toggleAll } = useRowSelection(pageId);

  const { checked, indeterminate } = useMemo(() => {
    if (loadedRowIds.length === 0) {
      return { checked: false, indeterminate: false };
    }
    const selectedInLoaded = loadedRowIds.reduce(
      (acc, id) => (selectedIds.has(id) ? acc + 1 : acc),
      0,
    );
    return {
      checked: selectedInLoaded === loadedRowIds.length,
      indeterminate:
        selectedInLoaded > 0 && selectedInLoaded < loadedRowIds.length,
    };
  }, [loadedRowIds, selectedIds]);

  if (loadedRowIds.length === 0) return null;

  return (
    <div className={classes.rowNumberHeaderInner}>
      <span className={classes.rowNumberHeaderHash}>#</span>
      <span className={classes.rowNumberHeaderCheckbox}>
        <Tooltip label={t("Select all loaded rows")} withinPortal>
          <Checkbox
            size="xs"
            checked={checked}
            indeterminate={indeterminate}
            onChange={() => toggleAll(loadedRowIds)}
            aria-label={t("Select all loaded rows")}
            tabIndex={-1}
          />
        </Tooltip>
      </span>
    </div>
  );
});
