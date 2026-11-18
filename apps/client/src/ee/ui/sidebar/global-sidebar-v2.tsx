import { useState } from "react";
import {
  ActionIcon,
  Button,
  Divider,
  Modal,
  ScrollArea,
  Tooltip,
} from "@mantine/core";
import {
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
import { useHasFeature } from "@/ee/hooks/use-feature";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import { Feature } from "@/ee/features";
import { useVerificationListQuery } from "@/ee/page-verification/queries/page-verification-query";
import { usePersonalSpaceQuery } from "@/ee/personal-space/queries/personal-space-query";
import CreatePersonalSpaceModal from "@/ee/personal-space/components/create-personal-space-modal";
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
} from "./sidebar-components";
import { SidebarSpacesNav } from "./sidebar-spaces-nav";
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

        <SidebarSpacesNav
          isSpaceActive={isSpaceActive}
          personalSpaceId={personalSpace?.id}
          onNavigate={handleNavClick}
        />
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
