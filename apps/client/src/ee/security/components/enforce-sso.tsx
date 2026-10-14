import { MantineSize } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  WorkspaceSettingToggle,
  WorkspaceToggleRow,
} from "@/ee/components/workspace-setting-toggle.tsx";
import { Feature } from "@/ee/features.ts";

const sso = {
  field: "enforceSso",
  read: (w) => w?.enforceSso,
  feature: Feature.SSO_CUSTOM,
} as const;

export default function EnforceSso() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      {...sso}
      ariaLabel={t("Toggle sso enforcement")}
      title={t("Enforce SSO")}
      description={t(
        "Once enforced, members will not be able to login with email and password.",
      )}
    />
  );
}

export function EnforceSsoToggle({
  size,
  label,
}: {
  size?: MantineSize;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceSettingToggle
      {...sso}
      size={size}
      label={label}
      ariaLabel={t("Toggle sso enforcement")}
    />
  );
}
