import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Container,
  Grid,
  Group,
  Stack,
  Tabs,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconClipboardCheck,
  IconClockHour3,
  IconExternalLink,
  IconEye,
  IconEyeOff,
  IconLibrary,
  IconPlus,
  IconSearch,
  IconSettings,
  IconShield,
  IconStar,
  IconStarFilled,
  IconUser,
  IconUsers,
  IconWorld,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGetSpaceBySlugQuery, useSpaceMembersInfiniteQuery } from "@/features/space/queries/space-query";
import {
  useSpaceWatchStatusQuery,
  useWatchSpaceMutation,
  useUnwatchSpaceMutation,
} from "@/features/space/queries/space-watcher-query";
import {
  useAddFavoriteMutation,
  useFavoriteIds,
  useRemoveFavoriteMutation,
} from "@/features/favorite/queries/favorite-query";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation";
import { getSpaceRoleLabel } from "@/features/space/types/space-role-data";
import type { ISpaceMember } from "@/features/space/types/space.types";
import { searchSpotlight } from "@/features/search/constants";
import { buildPublicSpaceUrl } from "@/features/page/page.utils";
import { isBetaPublicSpaces } from "@/lib/config";
import { formatMemberCount } from "@/lib/utils";
import { formattedDate } from "@/lib/time";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";
import { DocumentTitle } from "@/components/ui/document-title";
import SpaceSettingsModal from "@/features/space/components/settings-modal";
import RecentChanges from "@/components/common/recent-changes";
import FavoritesPages from "@/features/home/components/favorites-pages";
import CreatedByMe from "@/features/home/components/created-by-me";
import classes from "./space-overview-page.module.css";

type SettingsTab = "general" | "members";

type UserMember = Extract<ISpaceMember, { type: "user" }>;

export function SpaceOverviewPage() {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);
  const spaceId = space?.id ?? "";

  const spaceAbility = useSpaceAbility(space?.membership?.permissions);
  const { handleCreate } = useTreeMutation(spaceId);
  const [settingsOpened, { open: openSettings, close: closeSettings }] =
    useDisclosure(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [tab, setTab] = useState("recent");

  const favoriteIds = useFavoriteIds("space");
  const addFavorite = useAddFavoriteMutation();
  const removeFavorite = useRemoveFavoriteMutation();
  const { data: watchStatus } = useSpaceWatchStatusQuery(spaceId);
  const watchSpace = useWatchSpaceMutation();
  const unwatchSpace = useUnwatchSpaceMutation();
  const { data: membersData } = useSpaceMembersInfiniteQuery(spaceId, "");

  if (!space) return null;

  const canManagePages = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Page,
  );
  const isFavorited = favoriteIds.has(space.id);
  const isWatching = watchStatus?.watching ?? false;
  const isPublic = isBetaPublicSpaces() && !!space.isPublished;
  const roleLabel =
    getSpaceRoleLabel(space.membership?.role ?? "") ?? t("Member");

  const members = (
    membersData?.pages.flatMap((page) => page.items) ?? []
  ).filter((member): member is UserMember => member.type === "user");
  const memberCount = space.memberCount ?? members.length;

  const openSpaceSettings = (initialTab: SettingsTab) => {
    setSettingsTab(initialTab);
    openSettings();
  };

  const toggleFavorite = () => {
    const payload = { type: "space" as const, spaceId: space.id };
    if (isFavorited) removeFavorite.mutate(payload);
    else addFavorite.mutate(payload);
  };

  const toggleWatch = () => {
    if (isWatching) unwatchSpace.mutate(space.id);
    else watchSpace.mutate(space.id);
  };

  return (
    <>
      <DocumentTitle title={space.name} />
      <Container size={1100} pt="xl" className={classes.page}>
        <section className={classes.hero}>
          <div className={classes.heroMain}>
            <CustomAvatar
              name={space.name}
              avatarUrl={space.logo}
              type={AvatarIconType.SPACE_ICON}
              color="initials"
              variant="filled"
              size={56}
              radius="md"
            />
            <div className={classes.heroText}>
              <div className={classes.titleRow}>
                <h1 className={classes.title}>{space.name}</h1>
                {isPublic ? (
                  <Tooltip
                    label={t(
                      "Anyone on the internet can read the pages in this space, except restricted pages.",
                    )}
                    withArrow
                  >
                    <Badge
                      component="a"
                      href={buildPublicSpaceUrl({ spaceSlug: space.slug })}
                      target="_blank"
                      rel="noopener"
                      variant="light"
                      color="blue"
                      leftSection={<IconWorld size={11} />}
                      rightSection={<IconExternalLink size={10} />}
                      style={{ cursor: "pointer", flexShrink: 0 }}
                    >
                      {t("Public")}
                    </Badge>
                  </Tooltip>
                ) : (
                  <Badge variant="light" color="gray" style={{ flexShrink: 0 }}>
                    {t("Private")}
                  </Badge>
                )}
              </div>

              {space.description && (
                <p className={classes.description}>{space.description}</p>
              )}

              <div className={classes.meta}>
                <span className={classes.metaItem}>
                  <IconUsers size={14} />
                  {formatMemberCount(memberCount, t)}
                </span>
                <span className={classes.metaItem}>
                  <IconShield size={14} />
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <div className={classes.heroActions}>
            {canManagePages && (
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={() => handleCreate(null)}
              >
                {t("New page")}
              </Button>
            )}
            <Button
              variant="default"
              leftSection={<IconSearch size={16} />}
              onClick={() => searchSpotlight.open()}
            >
              {t("Search")}
            </Button>
            <Tooltip
              label={
                isFavorited ? t("Remove from favorites") : t("Add to favorites")
              }
              withArrow
            >
              <ActionIcon
                variant={isFavorited ? "light" : "default"}
                color={isFavorited ? "yellow" : "gray"}
                size="lg"
                aria-label={
                  isFavorited
                    ? t("Remove from favorites")
                    : t("Add to favorites")
                }
                onClick={toggleFavorite}
              >
                {isFavorited ? (
                  <IconStarFilled size={18} />
                ) : (
                  <IconStar size={18} />
                )}
              </ActionIcon>
            </Tooltip>
            <Tooltip
              label={isWatching ? t("Stop watching space") : t("Watch space")}
              withArrow
            >
              <ActionIcon
                variant={isWatching ? "light" : "default"}
                color={isWatching ? "blue" : "gray"}
                size="lg"
                aria-label={
                  isWatching ? t("Stop watching space") : t("Watch space")
                }
                onClick={toggleWatch}
              >
                {isWatching ? (
                  <IconEyeOff size={18} />
                ) : (
                  <IconEye size={18} />
                )}
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Space settings")} withArrow>
              <ActionIcon
                variant="default"
                color="gray"
                size="lg"
                aria-label={t("Space settings")}
                onClick={() => openSpaceSettings("general")}
              >
                <IconSettings size={18} />
              </ActionIcon>
            </Tooltip>
          </div>
        </section>

        <div className={classes.statGrid}>
          <div className={classes.statCard}>
            <div className={classes.statLabel}>{t("Members")}</div>
            <div className={classes.statValue}>
              {formatMemberCount(memberCount, t)}
            </div>
          </div>
          <div className={classes.statCard}>
            <div className={classes.statLabel}>{t("Your role")}</div>
            <div className={classes.statValue}>{roleLabel}</div>
          </div>
          <div className={classes.statCard}>
            <div className={classes.statLabel}>{t("Visibility")}</div>
            <div className={classes.statValue}>
              {isPublic ? t("Public") : t("Private")}
            </div>
          </div>
          <div className={classes.statCard}>
            <div className={classes.statLabel}>{t("Created")}</div>
            <div className={classes.statValue}>
              {formattedDate(new Date(space.createdAt))}
            </div>
          </div>
        </div>

        <Grid className={classes.layout} gap="md">
          <Grid.Col span={{ base: 12, lg: 8 }}>
            <section className={classes.card}>
              <div className={classes.cardHeader}>
                <h2 className={classes.cardTitle}>{t("Documents")}</h2>
                {canManagePages && (
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    leftSection={<IconPlus size={13} />}
                    onClick={() => handleCreate(null)}
                  >
                    {t("New page")}
                  </Button>
                )}
              </div>

              <Tabs value={tab} onChange={(value) => setTab(value ?? "recent")}>
                <Tabs.List
                  style={{ flexWrap: "nowrap", overflowX: "auto" }}
                >
                  <Tabs.Tab
                    value="recent"
                    leftSection={<IconClockHour3 size={15} />}
                  >
                    {t("Recently updated")}
                  </Tabs.Tab>
                  <Tabs.Tab value="favorites" leftSection={<IconStar size={15} />}>
                    {t("Favorites")}
                  </Tabs.Tab>
                  <Tabs.Tab value="created" leftSection={<IconUser size={15} />}>
                    {t("Created by me")}
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="recent" pt="sm">
                  <div className={classes.tableWrap}>
                    <RecentChanges spaceId={space.id} />
                  </div>
                </Tabs.Panel>
                <Tabs.Panel value="favorites" pt="sm">
                  <div className={classes.tableWrap}>
                    <FavoritesPages spaceId={space.id} />
                  </div>
                </Tabs.Panel>
                <Tabs.Panel value="created" pt="sm">
                  <div className={classes.tableWrap}>
                    <CreatedByMe spaceId={space.id} />
                  </div>
                </Tabs.Panel>
              </Tabs>
            </section>
          </Grid.Col>

          <Grid.Col span={{ base: 12, lg: 4 }}>
            <Stack gap="md">
              <section className={classes.card}>
                <div className={classes.cardHeader}>
                  <h2 className={classes.cardTitle}>{t("Members")}</h2>
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    onClick={() => openSpaceSettings("members")}
                  >
                    {t("View all")}
                  </Button>
                </div>

                {members.length === 0 ? (
                  <div className={classes.emptyMembers}>
                    {t("No members to show")}
                  </div>
                ) : (
                  <div className={classes.membersRow}>
                    {members.slice(0, 8).map((member) => (
                      <Tooltip
                        key={member.id}
                        label={member.name}
                        withArrow
                      >
                        <div className={classes.memberAvatar}>
                          <CustomAvatar
                            size={30}
                            avatarUrl={member.avatarUrl}
                            name={member.name}
                          />
                        </div>
                      </Tooltip>
                    ))}
                    {memberCount > 8 && (
                      <span className={classes.memberMore}>
                        +{memberCount - 8}
                      </span>
                    )}
                  </div>
                )}

                <Text size="xs" c="dimmed" mt={10}>
                  {formatMemberCount(memberCount, t)}
                </Text>
              </section>

              <section className={classes.card}>
                <div className={classes.cardHeader}>
                  <h2 className={classes.cardTitle}>{t("Quick actions")}</h2>
                </div>
                <div className={classes.quickList}>
                  <UnstyledButton
                    component={Link}
                    to="/reviews"
                    className={classes.quickItem}
                  >
                    <span className={classes.quickIcon}>
                      <IconClipboardCheck size={15} />
                    </span>
                    <span className={classes.quickLabel}>
                      {t("Review queue")}
                    </span>
                  </UnstyledButton>
                  <UnstyledButton
                    component={Link}
                    to="/documents"
                    className={classes.quickItem}
                  >
                    <span className={classes.quickIcon}>
                      <IconLibrary size={15} />
                    </span>
                    <span className={classes.quickLabel}>
                      {t("Document library")}
                    </span>
                  </UnstyledButton>
                  <UnstyledButton
                    component={Link}
                    to="/favorites"
                    className={classes.quickItem}
                  >
                    <span className={classes.quickIcon}>
                      <IconStar size={15} />
                    </span>
                    <span className={classes.quickLabel}>{t("Favorites")}</span>
                  </UnstyledButton>
                  <UnstyledButton
                    className={classes.quickItem}
                    onClick={() => openSpaceSettings("general")}
                  >
                    <span className={classes.quickIcon}>
                      <IconSettings size={15} />
                    </span>
                    <span className={classes.quickLabel}>
                      {t("Space settings")}
                    </span>
                  </UnstyledButton>
                  {isPublic && (
                    <UnstyledButton
                      component="a"
                      href={buildPublicSpaceUrl({ spaceSlug: space.slug })}
                      target="_blank"
                      rel="noopener"
                      className={classes.quickItem}
                    >
                      <span className={classes.quickIcon}>
                        <IconExternalLink size={15} />
                      </span>
                      <span className={classes.quickLabel}>
                        {t("Open public site")}
                      </span>
                    </UnstyledButton>
                  )}
                </div>
              </section>
            </Stack>
          </Grid.Col>
        </Grid>
      </Container>

      <SpaceSettingsModal
        spaceId={space.slug}
        opened={settingsOpened}
        onClose={closeSettings}
        initialTab={settingsTab}
      />
    </>
  );
}
