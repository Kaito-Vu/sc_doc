import { Divider } from "@mantine/core";
import ChangePassword from "@/features/user/components/change-password";
import useCurrentUser from "@/features/user/hooks/use-current-user";

// Provider-synced users (SSO/SCIM/LDAP) have no local password to change.
export default function LocalPasswordSection() {
  const { data } = useCurrentUser();
  if (!data || data.user?.hasGeneratedPassword) return null;
  return (
    <>
      <ChangePassword />
      <Divider my="lg" />
    </>
  );
}
