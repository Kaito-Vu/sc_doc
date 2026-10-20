import { useMemo, useState } from "react";
import {
  ActionIcon,
  Button,
  Divider,
  Modal,
  ScrollArea,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowRight,
  IconClipboardCheck,
  IconCommand,
  IconHome,
  IconLibrary,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSparkles,
  IconStar,
  IconTemplate,
  IconUser,
  IconUserPlus,
} from "@tabler/icons-react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useDisclosure } from "@mantine/hooks";
import { currentUserAtom, workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar";
import { useFavoritesQuery } from "@/features/favorite/queries/favorite-query";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import { Feature } from "@/ee/features";
import { useVerificationListQuery } from "@/ee/page-verification/queries/page-verification-query";
import { usePersonalSpaceQuery } from "@/ee/personal-space/queries/personal-space-query";
import CreatePersonalSpaceModal from "@/ee/personal-space/components/create-personal-space-modal";
import { excludePersonalSpaces } from "@/ee/personal-space/lib/filter-personal-spaces";
import { WorkspaceInviteForm } from "@/features/workspace/components/members/components/workspace-invite-form";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { searchSpotlight } from "@/features/search/constants";
import { getSpaceUrl } from "@/lib/config";
import { platformModifierLabel } from "@/lib";
import {
  commandPaletteOpenedAtom,
  quickCreateOpenedAtom,
} from "@/ee/ui/experience/atoms";
import {
  SidebarNavItem,
  SidebarSection,
  SidebarSpaceRow,
  SidebarEmpty,
} from "./sidebar-components";
import classes from "./global-sidebar-v2.module.css";

export function GlobalSidebarV2() {
  const { t } = useTranslation();
  const location = useLocation();
  const workspace = useAtomValue(workspaceAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const user = currentUser?.user;
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);
  const setCommandPaletteOpened = useSetAtom(commandPaletteOpenedAtom);
  const setQuickCreateOpened = useSetAtom(quickCreateOpenedAtom);
  const hasTemplates = useHasFeature(Feature.TEMPLATES);
  const hasPersonalSpaces = useHasFeature(Feature.PERSONAL_SPACES);
  const personalEnabled = workspace?.settings?.spaces?.allowPersonal === true;
  const upgradeLabel = useUpgradeLabel();
  const [inviteOpened, { open: openInvite, close: closeInvite }] =
    useDisclosure(false);
  const [personalCreateOpened, setPersonalCreateOpened] = useState(false);

  const { data: personalSpace } = usePersonalSpaceQuery(hasPersonalSpaces);
  const { data: favoriteSpacesData } = useFavoritesQuery("space");
  const { data: spacesData } = useGetSpacesQuery({ limit: 50 });
  const { data: reviewData } = useVerificationListQuery(
    {
      verifierId: user?.id,
      type: "qms",
      limit: 50,
    },
    !!user?.id,
  );

  const active = location.pathname;
  const aiChatEnabled = workspace?.settings?.ai?.chat === true;
  const isSpaceActive = (slug: string) => {
    const url = getSpaceUrl(slug);
    return active === url || active.startsWith(`${url}/`);
  };

  const pendingReviews =
    reviewData?.items.filter(
      (item) =>
        item.status === "in_approval" ||
        item.status === "needs_clarification",
    ).length ?? 0;

  const favoriteSpaces = useMemo(() => {
    const items =
      favoriteSpacesData?.pages
        .flatMap((page) => page.items)
        .flatMap((favorite) =>
          favorite.space?.id && favorite.space?.slug
            ? [favorite.space]
            : [],
        ) ?? [];
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [favoriteSpacesData]);

  const allSpaces = useMemo(
    () => excludePersonalSpaces(spacesData?.items ?? []),
    [spacesData],
  );

  const handleNavClick = () => {
    if (mobileSidebarOpened) {
      toggleMobileSidebar();
    }
  };

  return (
    <div className={classes.root} data-sc-sidebar="global">
      <div className={classes.header}>
        <Link to="/home" className={classes.brand} onClick={handleNavClick}>
          <CustomAvatar
            name={workspace?.name ?? "SC Doc"}
            avatarUrl={workspace?.logo}
            size={30}
            radius="md"
          />
          <span className={classes.brandText}>
            <span className={classes.brandName}>
              {workspace?.name ?? "SC Doc"}
            </span>
            <span className={classes.brandMeta}>{t("Workspace")}</span>
          </span>
        </Link>
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

      <Button
        className={classes.newButton}
        leftSection={<IconPlus size={16} />}
        onClick={() => setQuickCreateOpened(true)}
      >
        {t("New document")}
      </Button>

      <ScrollArea className={classes.scroll} type="hover" scrollbarSize={4}>
        <nav className={classes.nav} aria-label={t("Main navigation")}>
          <SidebarNavItem
            icon={IconHome}
            label={t("Home")}
            to="/home"
            active={active === "/home"}
            onNavigate={handleNavClick}
          />
          <SidebarNavItem
            icon={IconSearch}
            label={t("Search")}
            onClick={() => {
              searchSpotlight.open();
              handleNavClick();
            }}
            hint={`${platformModifierLabel}K`}
          />
          <SidebarNavItem
            icon={IconClipboardCheck}
            label={t("Review queue")}
            to="/reviews"
            active={active.startsWith("/reviews")}
            badge={pendingReviews}
            onNavigate={handleNavClick}
          />
          <SidebarNavItem
            icon={IconLibrary}
            label={t("Document library")}
            to="/documents"
            active={active.startsWith("/documents")}
            onNavigate={handleNavClick}
          />
          <SidebarNavItem
            icon={IconStar}
            label={t("Favorites")}
            to="/favorites"
            active={active.startsWith("/favorites")}
            onNavigate={handleNavClick}
          />
          <SidebarNavItem
            icon={IconTemplate}
            label={t("Templates")}
            to="/templates"
            active={active.startsWith("/templates")}
            disabled={!hasTemplates}
            disabledReason={upgradeLabel}
            onNavigate={handleNavClick}
          />
          {aiChatEnabled && (
            <SidebarNavItem
              icon={IconSparkles}
              label={t("AI Chat")}
              to="/ai"
              active={active.startsWith("/ai")}
              onNavigate={handleNavClick}
            />
          )}
          {hasPersonalSpaces && personalEnabled && (
            <SidebarNavItem
              icon={IconUser}
              label={t("Personal space")}
              to={personalSpace ? getSpaceUrl(personalSpace.slug) : undefined}
              active={!!personalSpace && isSpaceActive(personalSpace.slug)}
              onClick={
                personalSpace
                  ? undefined
                  : () => setPersonalCreateOpened(true)
              }
              onNavigate={personalSpace ? handleNavClick : undefined}
            />
          )}
        </nav>

        {favoriteSpaces.length > 0 && (
          <SidebarSection
            title={t("Favorite spaces")}
            collapsible
            defaultOpened
          >
            {favoriteSpaces.slice(0, 8).map((space) => (
              <SidebarSpaceRow
                key={space.id}
                space={space}
                active={isSpaceActive(space.slug)}
                onClick={handleNavClick}
              />
            ))}
          </SidebarSection>
        )}

        <SidebarSection
          title={t("Spaces")}
          collapsible
          action={
            <Tooltip label={t("View all spaces")} withArrow>
              <ActionIcon
                component={Link}
                to="/spaces"
                variant="subtle"
                color="gray"
                size="xs"
                aria-label={t("View all spaces")}
                onClick={handleNavClick}
              >
                <IconArrowRight size={14} />
              </ActionIcon>
            </Tooltip>
          }
        >
          {allSpaces.length === 0 ? (
            <SidebarEmpty>{t("No spaces yet")}</SidebarEmpty>
          ) : (
            <>
              {allSpaces.slice(0, 12).map((space) => (
                <SidebarSpaceRow
                  key={space.id}
                  space={space}
                  active={isSpaceActive(space.slug)}
                  onClick={handleNavClick}
                />
              ))}
              {allSpaces.length > 12 && (
                <Link
                  to="/spaces"
                  className={classes.viewAll}
                  onClick={handleNavClick}
                >
                  {t("View all {{count}} spaces", {
                    count: allSpaces.length,
                  })}
                  <IconArrowRight size={12} />
                </Link>
              )}
            </>
          )}
        </SidebarSection>
      </ScrollArea>

      <div className={classes.footer}>
        <SidebarNavItem
          icon={IconUserPlus}
          label={t("Invite people")}
          onClick={openInvite}
        />
        <SidebarNavItem
          icon={IconSettings}
          label={t("Settings")}
          to="/settings/account/profile"
          active={active.startsWith("/settings")}
          onNavigate={handleNavClick}
        />
        {user && (
          <Link
            to="/settings/account/profile"
            className={classes.userRow}
            onClick={handleNavClick}
          >
            <CustomAvatar
              size={26}
              avatarUrl={user.avatarUrl}
              name={user.name}
            />
            <span className={classes.userText}>
              <span className={classes.userName}>{user.name}</span>
              <span className={classes.userMeta}>{user.email}</span>
            </span>
          </Link>
        )}
      </div>

      <Modal
        size={560}
        opened={inviteOpened}
        onClose={closeInvite}
        title={t("Invite new members")}
        centered
      >
        <Divider size="xs" mb="sm" />
        <ScrollArea h="70vh">
          <WorkspaceInviteForm onClose={closeInvite} />
        </ScrollArea>
      </Modal>

      <CreatePersonalSpaceModal
        opened={personalCreateOpened}
        onClose={() => setPersonalCreateOpened(false)}
      />
    </div>
  );
}
