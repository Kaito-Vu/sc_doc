import AccountProfileGrid from "@/ee/account-profile/account-profile-grid";
import ChangeEmail from "@/features/user/components/change-email";
import LocalPasswordSection from "@/ee/account/local-password-section";
import { Divider } from "@mantine/core";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { useTranslation } from "react-i18next";
import { AccountMfaSection } from "@/features/user/components/account-mfa-section";
import SessionList from "@/features/session/components/session-list";
import { DocumentTitle } from "@/components/ui/document-title.tsx";

export default function AccountSettings() {
  const { t } = useTranslation();

  return (
    <>
      <DocumentTitle title={t("My Profile")} />
      <SettingsTitle title={t("My Profile")} />

      <AccountProfileGrid />

      <Divider my="lg" />

      <ChangeEmail />

      <Divider my="lg" />

      <LocalPasswordSection />

      <AccountMfaSection />

      <Divider my="lg" />

      <SessionList />
    </>
  );
}
