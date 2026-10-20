import { useMemo } from "react";
import { Popover } from "@mantine/core";
import { IBaseProperty, SelectTypeOptions, Choice } from "@/ee/base/types/base.types";
import { choiceColor } from "@/ee/base/components/cells/choice-color";
import { BadgeOverflowList } from "@/ee/base/components/cells/badge-overflow";
import { ChoicePicker } from "@/ee/base/components/cells/choice-picker";
import cellClasses from "@/ee/base/styles/cells.module.css";

type CellMultiSelectProps = {
  value: unknown;
  property: IBaseProperty;
  rowId: string;
  isEditing: boolean;
  onCommit: (value: unknown) => void;
  onValueChange: (value: unknown) => void;
  onCancel: () => void;
};

export function CellMultiSelect({
  value,
  property,
  isEditing,
  onValueChange,
  onCancel,
}: CellMultiSelectProps) {
  const typeOptions = property.typeOptions as SelectTypeOptions | undefined;
  const choices = typeOptions?.choices ?? [];
  const selectedIds = useMemo(
    () => (Array.isArray(value) ? (value as string[]) : []),
    [value],
  );
  const selectedChoices = choices.filter((c) => selectedIds.includes(c.id));

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
            <BadgeList choices={selectedChoices} />
          </div>
        </Popover.Target>
        <Popover.Dropdown p={4}>
          <ChoicePicker
            property={property}
            selectedIds={selectedIds}
            multiple
            allowCreate
            onToggle={(choice) =>
              onValueChange(
                selectedIds.includes(choice.id)
                  ? selectedIds.filter((id) => id !== choice.id)
                  : [...selectedIds, choice.id],
              )
            }
            onEscape={onCancel}
          />
        </Popover.Dropdown>
      </Popover>
    );
  }

  if (selectedChoices.length === 0) {
    return <span className={cellClasses.emptyValue} />;
  }

  return (
    <BadgeList
      choices={selectedChoices}
      tooltipLabel={selectedChoices.map((c) => c.name).join(", ")}
    />
  );
}

function BadgeList({
  choices,
  tooltipLabel,
}: {
  choices: Choice[];
  tooltipLabel?: string;
}) {
  const chips = choices.map((choice) => (
    <span
      key={choice.id}
      className={cellClasses.badge}
      style={choiceColor(choice.color)}
    >
      {choice.name}
    </span>
  ));
  return (
    <BadgeOverflowList
      chips={chips}
      measureKey={choices.map((c) => `${c.id}:${c.name}`).join("|")}
      tooltipLabel={tooltipLabel}
    />
  );
}
