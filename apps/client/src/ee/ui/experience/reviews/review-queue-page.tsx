import { useMemo, useState } from "react";
import {
  Avatar,
  Badge,
  Button,
  Container,
  Group,
  Stack,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowRight,
  IconClock,
  IconFileText,
  IconInbox,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useVerificationListQuery } from "@/ee/page-verification/queries/page-verification-query";
import { getStatusLabel } from "@/ee/page-verification/components/verification-status";
import type {
  IVerificationListItem,
  VerificationStatus,
} from "@/ee/page-verification/types/page-verification.types";
import { buildPageUrl } from "@/features/page/page.utils";
import { formattedDate } from "@/lib/time";
import { DocumentTitle } from "@/components/ui/document-title";
import { EmptyState } from "@/components/ui/empty-state";
import classes from "./review-queue-page.module.css";

function statusTone(status: VerificationStatus | null): string {
  switch (status) {
    case "approved":
    case "verified":
      return "blue";
    case "in_approval":
    case "needs_clarification":
    case "expiring":
      return "orange";
    case "expired":
      return "red";
    default:
      return "gray";
  }
}

function dedupe(items: IVerificationListItem[]): IVerificationListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.pageId)) return false;
    seen.add(item.pageId);
    return true;
  });
}

export function ReviewQueuePage() {
  const { t } = useTranslation();
  const currentUser = useAtomValue(currentUserAtom);
  const userId = currentUser?.user?.id;
  const [tab, setTab] = useState("mine");

  const { data: myReviews, isLoading: myLoading } = useVerificationListQuery(
    {
      verifierId: userId,
      type: "qms",
      limit: 50,
    },
    !!userId,
  );
  const { data: expiring, isLoading: expiringLoading } =
    useVerificationListQuery({ type: "expiring", limit: 50 });

  const mine = (myReviews?.items ?? []).filter(
    (item) =>
      item.status === "in_approval" ||
      item.status === "needs_clarification",
  );
  const dueSoon = (expiring?.items ?? []).filter(
    (item) => item.status === "expiring",
  );
  const overdue = (expiring?.items ?? []).filter(
    (item) => item.status === "expired",
  );
  const all = useMemo(
    () => dedupe([...mine, ...dueSoon, ...overdue]),
    [mine, dueSoon, overdue],
  );

  const items =
    tab === "mine"
      ? mine
      : tab === "due"
        ? dueSoon
        : tab === "overdue"
          ? overdue
          : all;
  const isLoading =
    tab === "mine" ? myLoading : tab === "due" || tab === "overdue" || tab === "all" ? expiringLoading : false;

  return (
    <>
      <DocumentTitle title={t("Review queue")} />
      <Container size={1000} pt="xl" pb={80}>
        <Stack gap="lg">
          <div>
            <Text component="h1" fw={650} fz="h3" m={0}>
              {t("Review queue")}
            </Text>
            <Text size="sm" c="dimmed" mt={4}>
              {t(
                "Documents waiting for your review, expiring soon, or already overdue.",
              )}
            </Text>
          </div>

          <Tabs value={tab} onChange={(value) => setTab(value ?? "mine")}>
            <Tabs.List>
              <Tabs.Tab value="mine">
                {t("My reviews")} ({mine.length})
              </Tabs.Tab>
              <Tabs.Tab value="due">
                {t("Due soon")} ({dueSoon.length})
              </Tabs.Tab>
              <Tabs.Tab value="overdue">
                {t("Overdue")} ({overdue.length})
              </Tabs.Tab>
              <Tabs.Tab value="all">{t("All")}</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value={tab} pt="md">
              {isLoading ? (
                <Text size="sm" c="dimmed">
                  {t("Loading...")}
                </Text>
              ) : items.length === 0 ? (
                <EmptyState
                  icon={IconInbox}
                  title={t("Nothing here")}
                  description={
                    tab === "mine"
                      ? t("You have no reviews waiting.")
                      : t("No documents in this queue.")
                  }
                />
              ) : (
                <Stack gap="xs">
                  {items.map((item) => {
                    const isReview =
                      item.status === "in_approval" ||
                      item.status === "needs_clarification";
                    return (
                      <div key={item.id} className={classes.row}>
                        <UnstyledButton
                          component={Link}
                          to={buildPageUrl(
                            item.spaceSlug,
                            item.pageSlugId,
                            item.pageTitle ?? undefined,
                          )}
                          className={classes.main}
                        >
                          <span className={classes.iconBox}>
                            <IconFileText size={18} />
                          </span>
                          <span className={classes.body}>
                            <Group gap="xs" wrap="nowrap">
                              <Text size="sm" fw={600} truncate>
                                {item.pageTitle || t("Untitled")}
                              </Text>
                              <Badge
                                size="xs"
                                variant="light"
                                color={statusTone(item.status)}
                              >
                                {getStatusLabel(
                                  (item.status ?? "none") as VerificationStatus,
                                  t,
                                )}
                              </Badge>
                            </Group>
                            <Group gap="sm" wrap="nowrap">
                              <Text size="xs" c="dimmed">
                                {item.spaceName}
                              </Text>
                              {item.expiresAt && (
                                <Group gap={4} wrap="nowrap">
                                  <IconClock size={12} />
                                  <Text size="xs" c="dimmed">
                                    {formattedDate(new Date(item.expiresAt))}
                                  </Text>
                                </Group>
                              )}
                            </Group>
                          </span>
                        </UnstyledButton>

                        <Group gap="xs" wrap="nowrap">
                          <Group gap={-6} wrap="nowrap">
                            {item.verifiers?.slice(0, 3).map((verifier) => (
                              <Avatar
                                key={verifier.id}
                                src={verifier.avatarUrl}
                                name={verifier.name}
                                size={22}
                                radius="xl"
                              />
                            ))}
                          </Group>
                          {isReview ? (
                            <Button
                              size="xs"
                              component={Link}
                              to={`/review/${item.pageSlugId}`}
                              rightSection={<IconArrowRight size={14} />}
                            >
                              {t("Review")}
                            </Button>
                          ) : (
                            <Button
                              size="xs"
                              variant="default"
                              component={Link}
                              to={buildPageUrl(
                                item.spaceSlug,
                                item.pageSlugId,
                                item.pageTitle ?? undefined,
                              )}
                              rightSection={<IconArrowRight size={14} />}
                            >
                              {t("Open")}
                            </Button>
                          )}
                        </Group>
                      </div>
                    );
                  })}
                </Stack>
              )}
            </Tabs.Panel>
          </Tabs>
        </Stack>
      </Container>
    </>
  );
}
