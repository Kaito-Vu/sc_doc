import { MantineSize } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  WorkspaceSettingToggle,
  WorkspaceToggleRow,
} from "@/ee/components/workspace-setting-toggle";
import { Feature } from "@/ee/features";

const aiSearch = {
  field: "aiSearch",
  read: (w) => w?.settings?.ai?.search,
  feature: Feature.AI,
} as const;

export default function EnableAiSearch() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      {...aiSearch}
      ariaLabel={t("Toggle AI search")}
      title={t("AI-powered search (AI Answers)")}
      description={t(
        "AI search uses vector embeddings to provide semantic search capabilities across your workspace content.",
      )}
    />
  );
}

export function AiSearchToggle({
  size,
  label,
}: {
  size?: MantineSize;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceSettingToggle
      {...aiSearch}
      size={size}
      label={label}
      ariaLabel={t("Toggle AI search")}
    />
  );
}
