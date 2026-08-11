import { FC } from "react";
import { Menu } from "@mantine/core";
import { IconListNumbers } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";

interface Props {
  onClick: () => void;
}

export const NumberingSettingsMenuItem: FC<Props> = ({ onClick }) => {
  const { t } = useTranslation();
  const hasNumbering = useHasFeature(Feature.NUMBERING);

  if (!hasNumbering) return null;

  return (
    <Menu.Item leftSection={<IconListNumbers size={16} />} onClick={onClick}>
      {t("Numbering settings")}
    </Menu.Item>
  );
};
