import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title";
import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import PersonalSpaceQuotaAdmin from "@/ee/personal-space/components/personal-space-quota-admin";

export default function QuotaSettings() {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>
          {t("Quota")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Quota")} />
      <PersonalSpaceQuotaAdmin />
    </>
  );
}
