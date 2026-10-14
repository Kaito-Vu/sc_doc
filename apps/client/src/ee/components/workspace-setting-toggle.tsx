import { ReactNode, useState } from "react";
import {
  Badge,
  Group,
  MantineSize,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { IWorkspace } from "@/features/workspace/types/workspace.types.ts";
import { useHasFeature } from "@/ee/hooks/use-feature.ts";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label.ts";

interface ToggleProps {
  /** Key sent to `updateWorkspace`, e.g. "enforceMfa". */
  field: string;
  /** Reads the current value from the workspace. */
  read: (workspace: IWorkspace | null | undefined) => boolean | undefined;
  /** Feature the switch is gated on; shows the upgrade tooltip without it. */
  feature: Parameters<typeof useHasFeature>[0];
  ariaLabel: string;
  size?: MantineSize;
  label?: string;
  /** Ask before applying (e.g. a confirm modal); call `apply` to proceed. */
  confirm?: (next: boolean, apply: () => void) => void;
}

/** Switch bound to one boolean workspace setting, gated on a licence feature. */
export function WorkspaceSettingToggle({
  field,
  read,
  feature,
  ariaLabel,
  size,
  label,
  confirm,
}: ToggleProps) {
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(!!read(workspace));
  const hasAccess = useHasFeature(feature);
  const upgradeLabel = useUpgradeLabel();

  const apply = async (value: boolean) => {
    try {
      const updated = await updateWorkspace({
        [field]: value,
      } as Partial<IWorkspace>);
      setChecked(value);
      setWorkspace(updated);
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    }
  };

  return (
    <Tooltip label={upgradeLabel} disabled={hasAccess} refProp="rootRef">
      <Switch
        size={size}
        label={label}
        labelPosition="left"
        checked={checked}
        onChange={(e) => {
          const value = e.currentTarget.checked;
          if (confirm) confirm(value, () => apply(value));
          else apply(value);
        }}
        disabled={!hasAccess}
        aria-label={ariaLabel}
      />
    </Tooltip>
  );
}

interface RowProps extends ToggleProps {
  title: ReactNode;
  description: ReactNode;
  /** Always-visible badge next to the title (e.g. "Beta"). */
  badge?: ReactNode;
  /** Show an "Enterprise" badge while the feature is unavailable. */
  enterpriseBadge?: boolean;
}

/** Settings row: title + description on the left, a workspace toggle on the right. */
export function WorkspaceToggleRow({
  title,
  description,
  badge,
  enterpriseBadge,
  ...toggle
}: RowProps) {
  const { t } = useTranslation();
  const hasAccess = useHasFeature(toggle.feature);
  const showEnterprise = enterpriseBadge && !hasAccess;

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        {badge || showEnterprise ? (
          <Group gap="xs" align="center">
            <Text size="md">{title}</Text>
            {badge}
            {showEnterprise && (
              <Badge variant="light" size="sm" radius="sm">
                {t("Enterprise")}
              </Badge>
            )}
          </Group>
        ) : (
          <Text size="md">{title}</Text>
        )}
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      </div>

      <WorkspaceSettingToggle {...toggle} />
    </Group>
  );
}
