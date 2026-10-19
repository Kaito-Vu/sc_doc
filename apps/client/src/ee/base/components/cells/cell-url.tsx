import { IBaseProperty } from "@/ee/base/types/base.types";
import { SafeUrlLink } from "./safe-url-link";
import { useEditableTextCell } from "@/ee/base/hooks/use-editable-text-cell";
import cellClasses from "@/ee/base/styles/cells.module.css";
import { useTranslation } from "react-i18next";

type CellUrlProps = {
  value: unknown;
  property: IBaseProperty;
  rowId: string;
  isEditing: boolean;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
};

const toDraft = (value: unknown) => (typeof value === "string" ? value : "");
const parse = (draft: string) => draft || null;

export function CellUrl({ value, property, rowId, isEditing, onCommit, onCancel }: CellUrlProps) {
  const { t } = useTranslation();
  const { draft, setDraft, inputRef, handleKeyDown, handleBlur } =
    useEditableTextCell({
      value,
      isEditing,
      onCommit,
      onCancel,
      toDraft,
      parse,
      rowId,
      propertyId: property.id,
    });

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="url"
        className={cellClasses.cellInput}
        value={draft}
        placeholder={t("https://...")}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
    );
  }

  const displayValue = toDraft(value);
  if (!displayValue) {
    return <span className={cellClasses.emptyValue} />;
  }

  return (
    <SafeUrlLink value={displayValue} fallback={<span>{displayValue}</span>} />
  );
}
