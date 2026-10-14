import { Group, Switch } from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import classes from "@/ee/security/components/sso.module.css";

/** Label on the left, switch on the right, bound to a boolean field of a Mantine form. */
export function SsoSwitchRow({
  label,
  form,
  field,
}: {
  label: string;
  form: UseFormReturnType<any>;
  field: string;
}) {
  return (
    <Group justify="space-between">
      <div>{label}</div>
      <Switch
        className={classes.switch}
        checked={form.values[field]}
        {...form.getInputProps(field)}
      />
    </Group>
  );
}

/** Copies the listed fields from `values` to `target`, only the ones the user changed. */
export function copyDirty(
  form: UseFormReturnType<any>,
  values: Record<string, any>,
  target: Record<string, any>,
  fields: string[],
) {
  for (const f of fields) {
    if (form.isDirty(f)) target[f] = values[f];
  }
}
