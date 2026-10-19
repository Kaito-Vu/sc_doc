import { z } from "zod/v4";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import {
  Box,
  Button,
  Group,
  SegmentedControl,
  Stack,
  TextInput,
} from "@mantine/core";
import { buildCallbackUrl } from "@/ee/security/sso.utils.ts";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import CopyTextButton from "@/components/common/copy.tsx";
import { useTranslation } from "react-i18next";
import { useUpdateSsoProviderMutation } from "@/ee/security/queries/security-query.ts";
import { OpenIdIcon } from "@/components/icons/openid-icon.tsx";
import { EntraIdIcon } from "@/components/icons/entra-id-icon.tsx";
import { SsoSwitchRow, copyDirty } from "@/ee/security/components/sso-form-fields.tsx";
import i18n from "@/i18n";

type OidcTemplate = "generic" | "azuread";

const ssoSchema = z
  .object({
    name: z.string().min(1, i18n.t("Display name is required")),
    template: z.enum(["generic", "azuread"]),
    oidcIssuer: z.string().optional(),
    oidcTenantId: z.string().optional(),
    oidcClientId: z.string().min(1, i18n.t("Client id is required")),
    oidcClientSecret: z.string().optional(),
    isEnabled: z.boolean(),
    allowSignup: z.boolean(),
    groupSync: z.boolean(),
  })
  .refine(
    (data) =>
      data.template !== "generic" || (data.oidcIssuer && data.oidcIssuer.length > 0),
    { message: i18n.t("Issuer URL is required"), path: ["oidcIssuer"] },
  )
  .refine(
    (data) =>
      data.template !== "azuread" ||
      (data.oidcTenantId && data.oidcTenantId.length > 0),
    { message: i18n.t("Tenant ID is required"), path: ["oidcTenantId"] },
  );

type SSOFormValues = z.infer<typeof ssoSchema>;

interface SsoFormProps {
  provider: IAuthProvider;
  onClose?: () => void;
}
export function SsoOIDCForm({ provider, onClose }: Readonly<SsoFormProps>) {
  const { t } = useTranslation();
  const updateSsoProviderMutation = useUpdateSsoProviderMutation();

  const initialTemplate: OidcTemplate =
    provider.settings?.oidc?.provider === "azuread" ? "azuread" : "generic";

  const form = useForm<SSOFormValues>({
    initialValues: {
      name: provider.name || "",
      template: initialTemplate,
      oidcIssuer: provider.oidcIssuer || "",
      oidcTenantId: provider.oidcTenantId || "",
      oidcClientId: provider.oidcClientId || "",
      oidcClientSecret: "",
      isEnabled: provider.isEnabled,
      allowSignup: provider.allowSignup,
      groupSync: provider.groupSync || false,
    },
    validate: zod4Resolver(ssoSchema),
  });

  const isAzureAd = form.values.template === "azuread";

  const callbackUrl = buildCallbackUrl({
    providerId: provider.id,
    type: provider.type,
    isAzureAd,
  });

  const displayedIssuer = isAzureAd
    ? form.values.oidcTenantId
      ? `https://login.microsoftonline.com/${form.values.oidcTenantId}/v2.0`
      : ""
    : form.values.oidcIssuer;

  const handleSubmit = async (values: SSOFormValues) => {
    const ssoData: Partial<IAuthProvider> = {
      providerId: provider.id,
    };
    copyDirty(form, values, ssoData, ["name"]);
    if (form.isDirty("template")) {
      ssoData.settings = {
        oidc: { provider: values.template === "azuread" ? "azuread" : "generic" },
      };
    }
    if (values.template === "generic" && form.isDirty("oidcIssuer")) {
      ssoData.oidcIssuer = values.oidcIssuer;
    }
    if (values.template === "azuread" && form.isDirty("oidcTenantId")) {
      ssoData.oidcTenantId = values.oidcTenantId;
    }
    copyDirty(form, values, ssoData, ["oidcClientId"]);
    if (form.isDirty("oidcClientSecret") && values.oidcClientSecret) {
      ssoData.oidcClientSecret = values.oidcClientSecret;
    }
    copyDirty(form, values, ssoData, ["isEnabled", "allowSignup", "groupSync"]);

    await updateSsoProviderMutation.mutateAsync(ssoData);
    form.resetDirty();
    onClose();
  };

  return (
    <Box maw={600} mx="auto">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack>
          <SegmentedControl
            fullWidth
            value={form.values.template}
            onChange={(value) => form.setFieldValue("template", value as OidcTemplate)}
            data={[
              {
                label: (
                  <Group gap={6} justify="center" wrap="nowrap">
                    <OpenIdIcon size={16} />
                    <span>{t("Generic OIDC")}</span>
                  </Group>
                ) as unknown as string,
                value: "generic",
              },
              {
                label: (
                  <Group gap={6} justify="center" wrap="nowrap">
                    <EntraIdIcon size={16} />
                    <span>{t("Microsoft Entra ID")}</span>
                  </Group>
                ) as unknown as string,
                value: "azuread",
              },
            ]}
          />

          <TextInput
            label={t("Display name")}
            placeholder={t("e.g Google SSO")}
            data-autofocus
            {...form.getInputProps("name")}
          />
          <TextInput
            label={t("Callback URL")}
            variant="filled"
            value={callbackUrl}
            pointer
            readOnly
            rightSection={<CopyTextButton text={callbackUrl} />}
          />

          {isAzureAd ? (
            <>
              <TextInput
                label={t("Tenant ID")}
                description={t("Enter your Microsoft Entra tenant ID")}
                placeholder={t("e.g 3f8e8b1a-1234-4a1b-9c8d-abcdef123456")}
                {...form.getInputProps("oidcTenantId")}
              />
              <TextInput
                label={t("Issuer URL")}
                description={t("Automatically derived from Tenant ID")}
                variant="filled"
                value={displayedIssuer}
                readOnly
              />
            </>
          ) : (
            <TextInput
              label={t("Issuer URL")}
              description={t("Enter your OIDC issuer URL")}
              placeholder={t("e.g https://accounts.google.com/")}
              {...form.getInputProps("oidcIssuer")}
            />
          )}

          <TextInput
            label={t("Client ID")}
            description={
              isAzureAd
                ? t("Enter your Azure App Registration client ID")
                : t("Enter your OIDC ClientId")
            }
            placeholder={t("e.g 292085223830.apps.googleusercontent.com")}
            {...form.getInputProps("oidcClientId")}
          />
          <TextInput
            label={t("Client Secret")}
            description={
              provider.oidcClientSecret
                ? t("Leave blank to keep the current secret")
                : t("Enter your OIDC Client Secret")
            }
            placeholder={provider.oidcClientSecret || t("e.g OCSPX-zVCkotEPGRnJA1XKUrbgjlf7PQQ-")}
            {...form.getInputProps("oidcClientSecret")}
          />

          <SsoSwitchRow label={t("Group sync")} form={form} field="groupSync" />

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
