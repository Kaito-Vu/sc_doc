import { useState } from "react";
import { Link } from "react-router-dom";
import { Progress, Text, UnstyledButton } from "@mantine/core";
import { IconUser } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import {
  usePersonalSpaceQuery,
  usePersonalSpaceUsageQuery,
} from "@/ee/personal-space/queries/personal-space-query";
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
  const { data: usage } = usePersonalSpaceUsageQuery(
    hasPersonalSpaces && settingEnabled && !!personalSpace,
  );
  const [createOpened, setCreateOpened] = useState(false);

  if (!hasPersonalSpaces || !settingEnabled) {
    return null;
  }

  if (personalSpace) {
    const spaceUrl = getSpaceUrl(personalSpace.slug);
    const active = currentPath === spaceUrl || currentPath.startsWith(`${spaceUrl}/`);

    return (
      <>
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
      {usage && <PersonalSpaceUsageBar used={usage.used} limit={usage.limit} />}
      </>
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

const formatSize = (n: number) =>
  n >= 1024 ** 3
    ? `${(n / 1024 ** 3).toFixed(1)} GB`
    : `${(n / 1024 ** 2).toFixed(n < 1024 ** 2 ? 2 : 1)} MB`;

function PersonalSpaceUsageBar({ used, limit }: { used: number; limit: number }) {
  const { t } = useTranslation();
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div style={{ padding: "0 var(--mantine-spacing-sm) 6px" }}>
      <Progress
        value={pct}
        size="xs"
        color={pct >= 95 ? "red" : pct >= 80 ? "yellow" : "blue"}
      />
      <Text size="xs" c="dimmed" mt={2}>
        {t("{{used}} of {{limit}} used", {
          used: formatSize(used),
          limit: formatSize(limit),
        })}
      </Text>
    </div>
  );
}
