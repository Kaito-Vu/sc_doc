import { useTranslation } from "react-i18next";
import { WorkspaceToggleRow } from "@/ee/components/workspace-setting-toggle";
import { Feature } from "@/ee/features";

export default function PersonalSpacesSetting() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      field="allowPersonalSpaces"
      read={(w) => w?.settings?.spaces?.allowPersonal === true}
      feature={Feature.PERSONAL_SPACES}
      ariaLabel={t("Toggle allow personal spaces")}
      title={t("Allow personal spaces")}
      description={t("Members can create their own personal space.")}
    />
  );
}
