import { useTranslation } from "react-i18next";
import { WorkspaceToggleRow } from "@/ee/components/workspace-setting-toggle";
import { Feature } from "@/ee/features";

export default function EnableGenerativeAi() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      field="generativeAi"
      read={(w) => w?.settings?.ai?.generative}
      feature={Feature.AI}
      ariaLabel={t("Toggle generative AI")}
      title={t("Generative AI (Ask AI)")}
      description={t(
        "Enable AI-powered content generation in the editor. Allows users to generate, improve, translate and transform text.",
      )}
    />
  );
}
