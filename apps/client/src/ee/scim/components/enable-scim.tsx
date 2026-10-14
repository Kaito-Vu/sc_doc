import { useTranslation } from "react-i18next";
import { WorkspaceToggleRow } from "@/ee/components/workspace-setting-toggle.tsx";
import { Feature } from "@/ee/features.ts";

export default function EnableScim() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      field="isScimEnabled"
      read={(w) => w?.isScimEnabled}
      feature={Feature.SCIM}
      ariaLabel={t("Toggle SCIM provisioning")}
      title={t("Enable SCIM")}
      description={t(
        "Automatically provision users and groups from your identity provider via SCIM.",
      )}
    />
  );
}
