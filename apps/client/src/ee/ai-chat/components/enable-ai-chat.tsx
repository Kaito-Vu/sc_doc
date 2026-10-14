import { Badge } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { WorkspaceToggleRow } from "@/ee/components/workspace-setting-toggle";
import { Feature } from "@/ee/features";

export default function EnableAiChat() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      field="aiChat"
      read={(w) => w?.settings?.ai?.chat}
      feature={Feature.AI}
      badge={
        <Badge color="gray" variant="light" size="sm" radius="sm">
          {t("Beta")}
        </Badge>
      }
      ariaLabel={t("Toggle AI Chat")}
      title={t("AI Chat")}
      description={t(
        "Enable AI Chat to allow users to have multi-turn conversations with AI about your workspace content.",
      )}
    />
  );
}
