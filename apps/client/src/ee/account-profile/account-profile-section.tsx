import { useAtom } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client.ts";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import AccountNameForm from "@/features/user/components/account-name-form.tsx";

// Linked SSO/LDAP account of the current user, or null for local users.
function useMyAuthAccount() {
  return useQuery({
    queryKey: ["sso-my-account"],
    queryFn: async () =>
      (
        await api.post<{ providerName: string; providerType: string } | null>(
          "/sso/my-account",
        )
      ).data,
  });
}

export default function AccountProfileSection() {
  const { t } = useTranslation();
  const [currentUser] = useAtom(currentUserAtom);
  const { data: authAccount, isLoading } = useMyAuthAccount();
  const user = currentUser?.user;

  if (isLoading) return null;

  const readOnly = (label: string, value?: string) =>
    value ? (
      <TextInput label={label} value={value} variant="filled" disabled />
    ) : null;

  return (
    <Stack gap="sm">
      {authAccount ? (
        <TextInput
          label={t("Name")}
          description={t("Synced from {{provider}}", {
            provider: authAccount.providerName,
          })}
          value={user?.name ?? ""}
          variant="filled"
          disabled
        />
      ) : (
        <AccountNameForm />
      )}
      {readOnly(t("Job title"), user?.jobTitle)}
      {readOnly(t("Department"), user?.department)}
      {readOnly(t("Employee ID"), user?.employeeId)}
    </Stack>
  );
}
