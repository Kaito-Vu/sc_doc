import { useTranslation } from "react-i18next";
import { WorkspaceToggleRow } from "@/ee/components/workspace-setting-toggle";
import { Feature } from "@/ee/features";

export default function AiChatWorkspaceKnowledgeOnly() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      field="aiChatWorkspaceKnowledgeOnly"
      read={(w) => w?.settings?.ai?.chatWorkspaceKnowledgeOnly}
      feature={Feature.AI_CONTROLS}
      enterpriseBadge
      ariaLabel={t("Toggle workspace knowledge only")}
      title={t("Workspace knowledge only")}
      description={t(
        "Restrict AI Chat to answering from your workspace pages and uploaded files only. It will not use outside knowledge.",
      )}
    />
  );
}
