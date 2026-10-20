import { ActionIcon, Menu } from "@mantine/core";
import { IconDots, IconEdit, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface CredentialRowMenuProps {
  ariaLabel: string;
  onRename?: () => void;
  onRevoke?: () => void;
}

export function CredentialRowMenu({
  ariaLabel,
  onRename,
  onRevoke,
}: CredentialRowMenuProps) {
  const { t } = useTranslation();
  return (
    <Menu position="bottom-end" withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" color="gray" aria-label={ariaLabel}>
          <IconDots size={16} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        {onRename && (
          <Menu.Item leftSection={<IconEdit size={16} />} onClick={onRename}>
            {t("Rename")}
          </Menu.Item>
        )}
        {onRevoke && (
          <Menu.Item
            leftSection={<IconTrash size={16} />}
            color="red"
            onClick={onRevoke}
          >
            {t("Revoke")}
          </Menu.Item>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}
