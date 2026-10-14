import { MantineSize } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  WorkspaceSettingToggle,
  WorkspaceToggleRow,
} from "@/ee/components/workspace-setting-toggle.tsx";
import { Feature } from "@/ee/features.ts";

const mfa = {
  field: "enforceMfa",
  read: (w) => w?.enforceMfa,
  feature: Feature.MFA,
} as const;

export default function EnforceMfa() {
  const { t } = useTranslation();

  return (
    <WorkspaceToggleRow
      {...mfa}
      ariaLabel={t("Toggle MFA enforcement")}
      title={t("Enforce two-factor authentication")}
      description={t(
        "Once enforced, all members must enable two-factor authentication to access the workspace.",
      )}
    />
  );
}

export function EnforceMfaToggle({
  size,
  label,
}: {
  size?: MantineSize;
  label?: string;
}) {
  const { t } = useTranslation();
  return (
    <WorkspaceSettingToggle
      {...mfa}
      size={size}
      label={label}
      ariaLabel={t("Toggle MFA enforcement")}
    />
  );
}
