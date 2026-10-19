import { z } from "zod/v4";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { Box, Button, Group, Stack, TextInput } from "@mantine/core";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import { useTranslation } from "react-i18next";
import { useUpdateSsoProviderMutation } from "@/ee/security/queries/security-query.ts";
import { SsoSwitchRow, copyDirty } from "@/ee/security/components/sso-form-fields.tsx";
import i18n from "@/i18n";

const ssoSchema = z.object({
  name: z.string().min(1, i18n.t("Provider name is required")),
  isEnabled: z.boolean(),
  allowSignup: z.boolean(),
});

type SSOFormValues = z.infer<typeof ssoSchema>;

interface SsoFormProps {
  provider: IAuthProvider;
  onClose?: () => void;
}
export function SsoGoogleForm({ provider, onClose }: Readonly<SsoFormProps>) {
  const { t } = useTranslation();
  const updateSsoProviderMutation = useUpdateSsoProviderMutation();

  const form = useForm<SSOFormValues>({
    initialValues: {
      name: provider.name || "",
      isEnabled: provider.isEnabled,
      allowSignup: provider.allowSignup,
    },
    validate: zod4Resolver(ssoSchema),
  });

  const handleSubmit = async (values: SSOFormValues) => {
    const ssoData: Partial<IAuthProvider> = {
      providerId: provider.id,
    };
    copyDirty(form, values, ssoData, ["name", "isEnabled", "allowSignup"]);

    await updateSsoProviderMutation.mutateAsync(ssoData);
    form.resetDirty();
    onClose();
  };

  return (
    <Box maw={600} mx="auto">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <TextInput
            label={t("Display name")}
            placeholder={t("e.g Okta SSO")}
            readOnly
            {...form.getInputProps("name")}
          />
          <SsoSwitchRow label={t("Allow signup")} form={form} field="allowSignup" />

          <SsoSwitchRow label={t("Enabled")} form={form} field="isEnabled" />

          <Group mt="md" justify="flex-end">
            <Button type="submit" disabled={!form.isDirty()}>
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </form>
    </Box>
  );
}
