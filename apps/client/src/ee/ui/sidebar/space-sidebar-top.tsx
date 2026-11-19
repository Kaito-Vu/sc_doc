import { ActionIcon, Tooltip } from "@mantine/core";
import {
  IconClipboardCheck,
  IconCommand,
  IconHome,
  IconLibrary,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { useSetAtom } from "jotai";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EeSpaceSwitcher } from "@/ee/ui/space-switcher/ee-space-switcher";
import { SpaceVisitTracker } from "@/ee/ui/space-switcher/space-visit-tracker";
import CreatePageMenu from "@/ee/template/components/create-page-menu";
import { searchSpotlight } from "@/features/search/constants";
import { getSpaceUrl } from "@/lib/config";
import { platformModifierLabel } from "@/lib";
import { usePendingReviewCount } from "@/ee/page-verification/hooks/use-pending-review-count";
import { commandPaletteOpenedAtom } from "@/ee/ui/experience/atoms";
import { SidebarNavItem } from "./sidebar-components";
import { useSpaceQuery } from "@/features/space/queries/space-query.ts";
import classes from "./space-sidebar-top.module.css";

type SpaceSidebarTopProps = {
  space: {
    id: string;
    name: string;
    slug: string;
    logo?: string | null;
    isPublished?: boolean;
    isArchived?: boolean;
    hasHomePage?: boolean;
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
  const setCommandPaletteOpened = useSetAtom(commandPaletteOpenedAtom);
  const pending = usePendingReviewCount();

  const active = location.pathname;
  const spaceUrl = getSpaceUrl(space.slug);
  // Personal spaces have no settings (no members, no roles).
  const isPersonal = !!useSpaceQuery(space.id).data?.isPersonal;

  return (
    <div className={classes.root}>
      <div className={classes.header}>
        <div className={classes.switcher}>
          <SpaceVisitTracker
            id={space.id}
            slug={space.slug}
            name={space.name}
            logo={space.logo}
          />
          <EeSpaceSwitcher
            spaceId={space.id}
            spaceName={space.name}
            spaceSlug={space.slug}
            spaceIcon={space.logo}
            isPublished={space.isPublished}
            isArchived={space.isArchived}
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
          label={space.hasHomePage ? t("Home") : t("Overview")}
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
        {!isPersonal && (
          <SidebarNavItem
            icon={IconSettings}
            label={t("Space settings")}
            onClick={() => {
              onOpenSettings();
              onNavigate?.();
            }}
          />
        )}
      </nav>

      <div className={classes.pagesDivider} />
    </div>
  );
}
