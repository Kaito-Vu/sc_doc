import { z } from "zod/v4";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import {
  Box,
  Button,
  Group,
  Stack,
  Switch,
  TextInput,
  Textarea,
  Text,
  Accordion,
} from "@mantine/core";
import classes from "@/ee/security/components/sso.module.css";
import { IAuthProvider } from "@/ee/security/types/security.types.ts";
import { useTranslation } from "react-i18next";
import { useUpdateSsoProviderMutation } from "@/ee/security/queries/security-query.ts";
import { IconInfoCircle } from "@tabler/icons-react";
import { SsoSwitchRow, copyDirty } from "@/ee/security/components/sso-form-fields.tsx";

const ssoSchema = z.object({
  name: z.string().min(1, "Display name is required"),
  ldapUrl: z
    .url({ message: "Must be a valid URL" })
    .refine((url) => url.startsWith("ldap"), "Must be an LDAP URL"),
  ldapBindDn: z.string().min(1, "Bind DN is required"),
  ldapBindPassword: z.string().min(1, "Bind password is required"),
  ldapBaseDn: z.string().min(1, "Base DN is required"),
  ldapUserSearchFilter: z.string().optional(),
  ldapTlsEnabled: z.boolean(),
  ldapTlsCaCert: z.string().optional(),
  isEnabled: z.boolean(),
  allowSignup: z.boolean(),
  groupSync: z.boolean(),
});

type SSOFormValues = z.infer<typeof ssoSchema>;

interface SsoFormProps {
  provider: IAuthProvider;
  onClose?: () => void;
}

export function SsoLDAPForm({ provider, onClose }: Readonly<SsoFormProps>) {
  const { t } = useTranslation();
  const updateSsoProviderMutation = useUpdateSsoProviderMutation();

  const form = useForm<SSOFormValues>({
    initialValues: {
      name: provider.name || "",
      ldapUrl: provider.ldapUrl || "",
      ldapBindDn: provider.ldapBindDn || "",
      ldapBindPassword: provider.ldapBindPassword || "",
      ldapBaseDn: provider.ldapBaseDn || "",
      ldapUserSearchFilter:
        provider.ldapUserSearchFilter || "(mail={{username}})",
      ldapTlsEnabled: provider.ldapTlsEnabled || false,
      ldapTlsCaCert: provider.ldapTlsCaCert || "",
      isEnabled: provider.isEnabled,
      allowSignup: provider.allowSignup,
      groupSync: provider.groupSync || false,
    },
    validate: zod4Resolver(ssoSchema),
  });

  const handleSubmit = async (values: SSOFormValues) => {
    const ssoData: Partial<IAuthProvider> = {
      providerId: provider.id,
    };
    copyDirty(form, values, ssoData, ["name", "ldapUrl", "ldapBindDn", "ldapBindPassword", "ldapBaseDn", "ldapUserSearchFilter", "ldapTlsEnabled", "ldapTlsCaCert", "isEnabled", "allowSignup", "groupSync"]);

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
            placeholder="e.g Company LDAP"
            data-autofocus
            {...form.getInputProps("name")}
          />

          <TextInput
            label="LDAP Server URL"
            description="URL of your LDAP server"
            placeholder="ldap://ldap.example.com:389 or ldaps://ldap.example.com:636"
            {...form.getInputProps("ldapUrl")}
          />

          <TextInput
            label="Bind DN"
            description="Distinguished Name of the service account for searching"
            placeholder="cn=admin,dc=example,dc=com"
            {...form.getInputProps("ldapBindDn")}
          />

          <TextInput
            label="Bind Password"
            description="Password for the service account"
            type="password"
            placeholder="••••••••"
            {...form.getInputProps("ldapBindPassword")}
          />

          <TextInput
            label="Base DN"
            description="Base DN where user searches will start"
            placeholder="ou=users,dc=example,dc=com"
            {...form.getInputProps("ldapBaseDn")}
          />

          <TextInput
            label="User Search Filter"
            description="LDAP filter to find users. Use {{username}} as placeholder"
            placeholder="(mail={{username}})"
            {...form.getInputProps("ldapUserSearchFilter")}
          />

          <Accordion variant="separated">
            <Accordion.Item value="advanced">
              <Accordion.Control icon={<IconInfoCircle size={20} />}>
                {t("Advanced Settings")}
              </Accordion.Control>
              <Accordion.Panel>
                <Stack>
                  <Group justify="space-between">
                    <div>
                      <Text size="sm">{t("Enable TLS/SSL")}</Text>
                      <Text size="xs" c="dimmed">
                        Use secure connection to LDAP server
                      </Text>
                    </div>
                    <Switch
                      className={classes.switch}
                      checked={form.values.ldapTlsEnabled}
                      {...form.getInputProps("ldapTlsEnabled")}
                    />
                  </Group>

                  {form.values.ldapTlsEnabled && (
                    <Textarea
                      label="CA Certificate"
                      description="PEM-encoded CA certificate for TLS verification (optional)"
                      placeholder="-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----"
                      minRows={4}
                      {...form.getInputProps("ldapTlsCaCert")}
                    />
                  )}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

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
