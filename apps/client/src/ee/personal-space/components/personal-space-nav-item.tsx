import { useState } from "react";
import { Link } from "react-router-dom";
import { UnstyledButton } from "@mantine/core";
import { IconUser } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { usePersonalSpaceQuery } from "@/ee/personal-space/queries/personal-space-query";
import CreatePersonalSpaceModal from "@/ee/personal-space/components/create-personal-space-modal";
import { getSpaceUrl } from "@/lib/config.ts";
import classes from "@/components/layouts/global/global-sidebar.module.css";

interface PersonalSpaceNavItemProps {
  currentPath: string;
  onNavigate?: () => void;
}

export default function PersonalSpaceNavItem({
  currentPath,
  onNavigate,
}: PersonalSpaceNavItemProps) {
  const { t } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const hasPersonalSpaces = useHasFeature(Feature.PERSONAL_SPACES);
  const settingEnabled = workspace?.settings?.spaces?.allowPersonal === true;
  const { data: personalSpace } = usePersonalSpaceQuery(hasPersonalSpaces);
  const [createOpened, setCreateOpened] = useState(false);

  if (!hasPersonalSpaces || !settingEnabled) {
    return null;
  }

  if (personalSpace) {
    const spaceUrl = getSpaceUrl(personalSpace.slug);
    const active = currentPath === spaceUrl || currentPath.startsWith(`${spaceUrl}/`);

    return (
      <Link
        className={classes.link}
        data-active={active || undefined}
        aria-current={active ? "page" : undefined}
        to={spaceUrl}
        onClick={onNavigate}
      >
        <IconUser className={classes.linkIcon} stroke={2} />
        <span>{t("Personal space")}</span>
      </Link>
    );
  }

  return (
    <>
      <UnstyledButton
        className={classes.link}
        onClick={() => setCreateOpened(true)}
      >
        <IconUser className={classes.linkIcon} stroke={2} />
        <span>{t("Personal space")}</span>
      </UnstyledButton>
      <CreatePersonalSpaceModal
        opened={createOpened}
        onClose={() => setCreateOpened(false)}
      />
    </>
  );
}
