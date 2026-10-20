import { ActionIcon, Tooltip } from "@mantine/core";
import {
  IconClipboardCheck,
  IconCommand,
  IconHome,
  IconLibrary,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SwitchSpace } from "@/features/space/components/sidebar/switch-space";
import CreatePageMenu from "@/ee/template/components/create-page-menu";
import { searchSpotlight } from "@/features/search/constants";
import { getSpaceUrl } from "@/lib/config";
import { platformModifierLabel } from "@/lib";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useVerificationListQuery } from "@/ee/page-verification/queries/page-verification-query";
import { commandPaletteOpenedAtom } from "@/ee/ui/experience/atoms";
import { SidebarNavItem } from "./sidebar-components";
import classes from "./space-sidebar-top.module.css";

type SpaceSidebarTopProps = {
  space: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    isPublished?: boolean;
  };
  canManagePages: boolean;
  onCreatePage: () => void;
  onOpenSettings: () => void;
  onNavigate?: () => void;
};

export function SpaceSidebarTop({
  space,
  canManagePages,
  onCreatePage,
  onOpenSettings,
  onNavigate,
}: SpaceSidebarTopProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const currentUser = useAtomValue(currentUserAtom);
  const setCommandPaletteOpened = useSetAtom(commandPaletteOpenedAtom);
  const { data } = useVerificationListQuery(
    {
      verifierId: currentUser?.user?.id,
      type: "qms",
      limit: 50,
    },
    !!currentUser?.user?.id,
  );

  const pending =
    data?.items.filter(
      (item) =>
        item.status === "in_approval" ||
        item.status === "needs_clarification",
    ).length ?? 0;

  const active = location.pathname;
  const spaceUrl = getSpaceUrl(space.slug);

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <div className={classes.switcher}>
          <SwitchSpace
            spaceName={space.name}
            spaceSlug={space.slug}
            spaceIcon={space.logo}
            isPublished={space.isPublished}
          />
        </div>
        <Tooltip label={t("Workspace home")} withArrow>
          <ActionIcon
            component={Link}
            to="/home"
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={t("Workspace home")}
            onClick={onNavigate}
          >
            <IconHome size={18} stroke={1.8} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Command palette")} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={t("Command palette")}
            onClick={() => setCommandPaletteOpened(true)}
          >
            <IconCommand size={18} stroke={1.8} />
          </ActionIcon>
        </Tooltip>
      </div>

      {canManagePages && (
        <CreatePageMenu
          spaceId={space.id}
          trigger="menuItem"
          className={classes.newPage}
          innerClassName={classes.newPageInner}
          iconClassName={classes.newPageIcon}
          onCreateBlank={onCreatePage}
        />
      )}

      <nav className={classes.nav} aria-label={t("Space navigation")}>
        <SidebarNavItem
          icon={IconHome}
          label={t("Overview")}
          to={spaceUrl}
          active={active.toLowerCase() === spaceUrl.toLowerCase()}
          onNavigate={onNavigate}
        />
        <SidebarNavItem
          icon={IconSearch}
          label={t("Search")}
          onClick={() => {
            searchSpotlight.open();
            onNavigate?.();
          }}
          hint={`${platformModifierLabel}K`}
        />
        <SidebarNavItem
          icon={IconClipboardCheck}
          label={t("Review queue")}
          to="/reviews"
          active={active.startsWith("/reviews")}
          badge={pending}
          onNavigate={onNavigate}
        />
        <SidebarNavItem
          icon={IconLibrary}
          label={t("Document library")}
          to="/documents"
          active={active.startsWith("/documents")}
          onNavigate={onNavigate}
        />
        <SidebarNavItem
          icon={IconSettings}
          label={t("Space settings")}
          onClick={() => {
            onOpenSettings();
            onNavigate?.();
          }}
        />
      </nav>

      <div className={classes.pagesDivider} />
    </div>
  );
}
