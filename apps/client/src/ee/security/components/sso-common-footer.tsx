import { Button, Group } from "@mantine/core";
import { UseFormReturnType } from "@mantine/form";
import { useTranslation } from "react-i18next";
import { SsoSwitchRow } from "@/ee/security/components/sso-form-fields.tsx";

export function SsoCommonFooter({ form }: { form: UseFormReturnType<any> }) {
  const { t } = useTranslation();
  return (
    <>
      <SsoSwitchRow label={t("Group sync")} form={form} field="groupSync" />

      <SsoSwitchRow label={t("Allow signup")} form={form} field="allowSignup" />

      <SsoSwitchRow label={t("Enabled")} form={form} field="isEnabled" />

      <Group mt="md" justify="flex-end">
        <Button type="submit" disabled={!form.isDirty()}>
          {t("Save")}
        </Button>
      </Group>
    </>
  );
}
