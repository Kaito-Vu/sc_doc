import { useMemo } from "react";
import {
  Anchor,
  Box,
  Button,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowRight,
  IconClipboardCheck,
  IconCommand,
  IconFileText,
  IconLayoutGrid,
  IconPlus,
  IconSearch,
  IconSparkles,
} from "@tabler/icons-react";
import { useAtomValue, useSetAtom } from "jotai";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useVerificationListQuery } from "@/ee/page-verification/queries/page-verification-query";
import { getStatusLabel } from "@/ee/page-verification/components/verification-status";
import type { VerificationStatus } from "@/ee/page-verification/types/page-verification.types";
import { useFavoritesQuery } from "@/features/favorite/queries/favorite-query";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { getSpaceUrl } from "@/lib/config";
import { formattedDate, timeAgo } from "@/lib/time";
import { searchSpotlight } from "@/features/search/constants";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";
import { DocumentTitle } from "@/components/ui/document-title";
import RecentChanges from "@/components/common/recent-changes";
import {
  commandPaletteOpenedAtom,
  quickCreateOpenedAtom,
  recentPagesListAtom,
} from "../atoms";
import classes from "./home-experience.module.css";

export function HomeExperience() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentUser = useAtomValue(currentUserAtom);
  const recentPages = useAtomValue(recentPagesListAtom);
  const setQuickCreateOpened = useSetAtom(quickCreateOpenedAtom);
  const setCommandPaletteOpened = useSetAtom(commandPaletteOpenedAtom);
  const userId = currentUser?.user?.id;

  const { data: myReviews } = useVerificationListQuery(
    {
      verifierId: userId,
      type: "qms",
      limit: 30,
    },
    !!userId,
  );
  const { data: expiring } = useVerificationListQuery({
    type: "expiring",
    limit: 30,
  });
  const { data: favoriteSpacesData } = useFavoritesQuery("space");
  const { data: spacesData } = useGetSpacesQuery({ limit: 6 });

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t("Good morning")
      : hour < 18
        ? t("Good afternoon")
        : t("Good evening");

  const attention = useMemo(() => {
    const seen = new Set<string>();
    return [
      ...(myReviews?.items ?? []).filter(
        (item) =>
          item.status === "in_approval" ||
          item.status === "needs_clarification",
      ),
      ...(expiring?.items ?? []).filter(
        (item) => item.status === "expiring" || item.status === "expired",
      ),
    ]
      .filter((item) => {
        if (seen.has(item.pageId)) return false;
        seen.add(item.pageId);
        return true;
      })
      .slice(0, 5);
  }, [myReviews, expiring]);

  const favoriteSpaces =
    favoriteSpacesData?.pages
      .flatMap((page) => page.items)
      .filter((favorite) => !!favorite.space)
      .map((favorite) => favorite.space) ?? [];

  const spaces =
    favoriteSpaces.length > 0 ? favoriteSpaces.slice(0, 6) : spacesData?.items;

  return (
    <>
      <DocumentTitle title={t("Home")} />
      <Container size={1000} pt="xl" pb={80}>
        <Stack gap="xl">
          <div className={classes.hero}>
            <h1 className={classes.heroTitle}>
              {greeting},{" "}
              {currentUser?.user?.name?.split(" ")[0] ||
                t("there")}
            </h1>
            <p className={classes.heroSubtitle}>
              {t("Here is what needs your attention today.")}
            </p>

            <div className={classes.actionGrid}>
              <Button
                size="sm"
                leftSection={<IconPlus size={16} />}
                onClick={() => setQuickCreateOpened(true)}
              >
                {t("New document")}
              </Button>
              <Button
                size="sm"
                variant="default"
                leftSection={<IconSearch size={16} />}
                onClick={() => searchSpotlight.open()}
              >
                {t("Search")}
              </Button>
              <Button
                size="sm"
                variant="default"
                leftSection={<IconClipboardCheck size={16} />}
                onClick={() => navigate("/reviews")}
              >
                {t("Review queue")}
              </Button>
              <Button
                size="sm"
                variant="subtle"
                leftSection={<IconCommand size={16} />}
                onClick={() => setCommandPaletteOpened(true)}
              >
                {t("Command palette")}
              </Button>
            </div>
          </div>

          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <section className={classes.card}>
              <div className={classes.sectionHeader}>
                <h2 className={classes.sectionTitle}>
                  {t("Continue working")}
                </h2>
                {recentPages.length > 0 && (
                  <Anchor component={Link} to="/favorites" size="xs">
                    {t("View all")}
                  </Anchor>
                )}
              </div>

              {recentPages.length === 0 ? (
                <div className={classes.empty}>
                  {t("Open a document and it will appear here.")}
                </div>
              ) : (
                <div className={classes.list}>
                  {recentPages.slice(0, 5).map((page) => (
                    <UnstyledButton
                      key={page.pageId}
                      component={Link}
                      to={buildPageUrl(
                        page.spaceSlug,
                        page.slugId,
                        page.title,
                      )}
                      className={classes.row}
                    >
                      <span className={classes.iconBox}>
                        <IconFileText size={16} />
                      </span>
                      <span className={classes.rowMain}>
                        <span className={classes.rowTitle}>
                          {page.title || t("Untitled")}
                        </span>
                        <span className={classes.rowMeta}>
                          {page.spaceName || page.spaceSlug} ·{" "}
                          {timeAgo(new Date(page.visitedAt))}
                        </span>
                      </span>
                      <IconArrowRight size={14} opacity={0.4} />
                    </UnstyledButton>
                  ))}
                </div>
              )}
            </section>

            <section className={classes.card}>
              <div className={classes.sectionHeader}>
                <h2 className={classes.sectionTitle}>
                  {t("Needs attention")}
                </h2>
                <Anchor component={Link} to="/reviews" size="xs">
                  {t("View all")}
                </Anchor>
              </div>

              {attention.length === 0 ? (
                <div className={classes.empty}>
                  {t("Nothing needs your attention right now.")}
                </div>
              ) : (
                <div className={classes.list}>
                  {attention.map((item) => {
                    const isReview =
                      item.status === "in_approval" ||
                      item.status === "needs_clarification";
                    const tone =
                      item.status === "expired" ? "danger" : undefined;
                    return (
                      <UnstyledButton
                        key={item.id}
                        component={Link}
                        to={
                          isReview
                            ? `/review/${item.pageSlugId}`
                            : buildPageUrl(
                                item.spaceSlug,
                                item.pageSlugId,
                                item.pageTitle ?? undefined,
                              )
                        }
                        className={classes.row}
                      >
                        <span
                          className={classes.statusDot}
                          data-tone={tone}
                        />
                        <span className={classes.rowMain}>
                          <span className={classes.rowTitle}>
                            {item.pageTitle || t("Untitled")}
                          </span>
                          <span className={classes.rowMeta}>
                            {item.spaceName} ·{" "}
                            {getStatusLabel(
                              (item.status ?? "none") as VerificationStatus,
                              t,
                            )}
                            {item.expiresAt
                              ? ` · ${formattedDate(new Date(item.expiresAt))}`
                              : ""}
                          </span>
                        </span>
                        <IconArrowRight size={14} opacity={0.4} />
                      </UnstyledButton>
                    );
                  })}
                </div>
              )}
            </section>
          </SimpleGrid>

          <section>
            <div className={classes.sectionHeader}>
              <h2 className={classes.sectionTitle}>
                {t("Recently updated")}
              </h2>
            </div>
            <Box
              className={classes.card}
              style={{ overflowX: "auto", padding: 8 }}
            >
              <RecentChanges />
            </Box>
          </section>

          <section>
            <div className={classes.sectionHeader}>
              <h2 className={classes.sectionTitle}>{t("Your spaces")}</h2>
              <Anchor component={Link} to="/spaces" size="xs">
                {t("View all")}
              </Anchor>
            </div>

            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="sm">
              {(spaces ?? []).map((space) => (
                <UnstyledButton
                  key={space.id}
                  component={Link}
                  to={getSpaceUrl(space.slug)}
                  className={classes.row}
                  style={{
                    border: "1px solid light-dark(rgba(15,23,42,.08), rgba(255,255,255,.1))",
                  }}
                >
                  <CustomAvatar
                    name={space.name}
                    avatarUrl={space.logo}
                    type={AvatarIconType.SPACE_ICON}
                    color="initials"
                    variant="filled"
                    size={30}
                  />
                  <span className={classes.rowMain}>
                    <span className={classes.rowTitle}>{space.name}</span>
                    <span className={classes.rowMeta}>
                      {space.memberCount} {t("members")}
                    </span>
                  </span>
                  <IconLayoutGrid size={14} opacity={0.4} />
                </UnstyledButton>
              ))}
            </SimpleGrid>
          </section>

          {currentUser?.workspace?.settings?.ai?.chat && (
            <section>
              <Anchor
                component={Link}
                to="/ai"
                size="sm"
                className={classes.row}
                style={{ display: "inline-flex" }}
              >
                <IconSparkles size={16} />
                {t("Ask AI about your documents")}
              </Anchor>
            </section>
          )}
        </Stack>
      </Container>
    </>
  );
}
