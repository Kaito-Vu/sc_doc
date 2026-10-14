import { Checkbox, CheckboxProps } from "@mantine/core";

/** [ ] none, [-] some, [x] all. */
export type TriState = "none" | "some" | "all";

export function triState(selected: number, total: number): TriState {
  if (selected <= 0) return "none";
  return selected >= total ? "all" : "some";
}

interface Props extends Omit<
  CheckboxProps,
  "checked" | "indeterminate" | "onChange"
> {
  state: TriState;
  /** Receives the wanted result: clicking [-] or [ ] selects all (true), clicking [x] clears (false). */
  onChange: (checked: boolean) => void;
}

/** Checkbox with three states, for parents whose children can be partly selected. */
export function TriStateCheckbox({ state, onChange, ...rest }: Props) {
  return (
    <Checkbox
      {...rest}
      checked={state === "all"}
      indeterminate={state === "some"}
      onChange={(e) => onChange(e.currentTarget.checked)}
    />
  );
}
