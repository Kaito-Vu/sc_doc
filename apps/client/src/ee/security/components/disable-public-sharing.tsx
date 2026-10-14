import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import { WorkspaceToggleRow } from "@/ee/components/workspace-setting-toggle";
import { Feature } from "@/ee/features";

export default function DisablePublicSharing() {
  const { t } = useTranslation();

  const confirm = (value: boolean, apply: () => void) =>
    modals.openConfirmModal({
      title: value ? t("Disable public sharing") : t("Enable public sharing"),
      children: (
        <Text size="sm">
          {value
            ? t(
                "Are you sure you want to disable public sharing? All existing shared links in this workspace will be deleted.",
              )
            : t(
                "Are you sure you want to enable public sharing? Members will be able to share pages publicly.",
              )}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Confirm"), cancel: t("Cancel") },
      confirmProps: value ? { color: "red" } : {},
      onConfirm: apply,
    });

  return (
    <WorkspaceToggleRow
      field="disablePublicSharing"
      read={(w) => w?.settings?.sharing?.disabled === true}
      feature={Feature.SHARING_CONTROLS}
      ariaLabel={t("Toggle public sharing")}
      title={t("Disable public sharing")}
      description={t("Prevent members from sharing pages publicly.")}
      confirm={confirm}
    />
  );
}
