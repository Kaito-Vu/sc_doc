import { useTranslation } from "react-i18next";
import { WorkspaceToggleRow } from "@/ee/components/workspace-setting-toggle";
import { Feature } from "@/ee/features";

export default function AiChatReadOnly() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      field="aiChatReadOnly"
      read={(w) => w?.settings?.ai?.chatReadOnly}
      feature={Feature.AI_CONTROLS}
      enterpriseBadge
      ariaLabel={t("Toggle AI Chat read-only mode")}
      title={t("Read-only mode")}
      description={t(
        "AI Chat can search and read workspace content, but cannot create or edit pages.",
      )}
    />
  );
}
