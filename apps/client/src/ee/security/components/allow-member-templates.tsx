import { useTranslation } from "react-i18next";
import { WorkspaceToggleRow } from "@/ee/components/workspace-setting-toggle";
import { Feature } from "@/ee/features";

export default function AllowMemberTemplates() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      field="allowMemberTemplates"
      read={(w) => w?.settings?.templates?.allowMemberTemplates === true}
      feature={Feature.TEMPLATES}
      ariaLabel={t("Toggle allow members to create templates")}
      title={t("Allow members to create templates")}
      description={t(
        "Allow non-admin members to create and manage templates in their spaces.",
      )}
    />
  );
}
