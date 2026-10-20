import { useMemo } from "react";
import { Popover } from "@mantine/core";
import { IBaseProperty, SelectTypeOptions } from "@/ee/base/types/base.types";
import { choiceColor } from "@/ee/base/components/cells/choice-color";
import { ChoiceBadge } from "@/ee/base/components/cells/choice-badge";
import { ChoicePicker } from "@/ee/base/components/cells/choice-picker";
import cellClasses from "@/ee/base/styles/cells.module.css";

type CellStatusProps = {
  value: unknown;
  property: IBaseProperty;
  rowId: string;
  isEditing: boolean;
  onCommit: (value: unknown) => void;
  onCancel: () => void;
};

export function CellStatus({
  value,
  property,
  isEditing,
  onCommit,
  onCancel,
}: CellStatusProps) {
  const typeOptions = property.typeOptions as SelectTypeOptions | undefined;
  const choices = typeOptions?.choices ?? [];
  const selectedId = typeof value === "string" ? value : null;
  const selectedChoice = choices.find((c) => c.id === selectedId);
  const selectedIds = useMemo(() => (selectedId ? [selectedId] : []), [selectedId]);

  if (isEditing) {
    return (
      <Popover
        opened
        onChange={(o) => {
          if (!o) onCancel();
        }}
        onClose={onCancel}
        position="bottom-start"
        width={220}
        trapFocus
        closeOnClickOutside
        closeOnEscape
      >
        <Popover.Target>
          <div className={cellClasses.popoverTarget}>
            {selectedChoice ? (
              <span
                className={cellClasses.badge}
                style={choiceColor(selectedChoice.color)}
              >
                {selectedChoice.name}
              </span>
            ) : (
              <span className={cellClasses.emptyValue} />
            )}
          </div>
        </Popover.Target>
        <Popover.Dropdown p={4}>
          <ChoicePicker
            property={property}
            selectedIds={selectedIds}
            grouped
            onToggle={(choice) =>
              onCommit(choice.id === selectedId ? null : choice.id)
            }
            onEscape={onCancel}
          />
        </Popover.Dropdown>
      </Popover>
    );
  }

  if (!selectedChoice) {
    return <span className={cellClasses.emptyValue} />;
  }

  return (
    <ChoiceBadge
      name={selectedChoice.name}
      style={choiceColor(selectedChoice.color)}
    />
  );
}
