import React, { useState } from "react";
import {
  Anchor,
  Avatar,
  Badge,
  Button,
  Divider,
  Group,
  Stack,
  Tabs,
  Text,
  UnstyledButton,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArchive,
  IconChevronRight,
  IconCircleCheck,
  IconClipboardCheck,
  IconCalendar,
  IconClock,
  IconFileText,
  IconHistory,
  IconLink,
  IconLock,
  IconPencil,
  IconShieldCheck,
  IconTag,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { useSetAtom } from "jotai";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePageQuery } from "@/features/page/queries/page-query";
import { useBacklinksCountQuery } from "@/features/page-details/queries/backlinks-query";
import { BacklinksModal } from "@/features/page-details/components/backlinks-modal";
import { LabelsSection } from "@/features/label/components/labels-section";
import { historyAtoms } from "@/features/page-history/atoms/history-atoms";
import HistoryModal from "@/features/page-history/components/history-modal";
import { formattedDate } from "@/lib/time";
import { useTimeAgo } from "@/hooks/use-time-ago";
import { extractPageSlugId } from "@/lib";
import type { IPage } from "@/features/page/types/page.types";
import {
  useMarkObsoleteMutation,
  usePageVerificationInfoQuery,
  useSubmitForReviewMutation,
} from "@/ee/page-verification/queries/page-verification-query";
import { PageVerificationModal } from "@/ee/page-verification/components/page-verification-modal";
import { getStatusLabel } from "@/ee/page-verification/components/verification-status";
import type { VerificationStatus } from "@/ee/page-verification/types/page-verification.types";
import {
  ActionsSection,
  DangerZoneSection,
  DisplaySection,
  LockSection,
  PeopleSection,
  StatsSection,
} from "@/ee/components/detail-info-panel/sections";
import { useDocMetadataQuery } from "@/ee/docs";
import { DOC_CLASSIFICATIONS } from "@/ee/docs/types";
import { DocMetadataModal } from "./doc-metadata-modal";
import classes from "./doc-info-panel.module.css";

type DocInfoTab = "info" | "links" | "activity" | "actions";

type DocInfoPanelProps = {
  initialTab?: DocInfoTab;
};

function statusTone(status: VerificationStatus): string {
  switch (status) {
    case "approved":
    case "verified":
      return "blue";
    case "expiring":
    case "in_approval":
    case "needs_clarification":
      return "orange";
    case "expired":
      return "red";
    default:
      return "gray";
  }
}

export function DocInfoPanel({ initialTab = "info" }: DocInfoPanelProps) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });
  const [activeTab, setActiveTab] = useState<DocInfoTab>(initialTab);

  if (!page) return null;

  return (
    <div className={classes.root}>
      <Tabs
        value={activeTab}
        onChange={(value) => setActiveTab((value as DocInfoTab) ?? "info")}
        className={classes.tabs}
        variant="default"
      >
        <Tabs.List grow>
          <Tabs.Tab value="info">{t("Info")}</Tabs.Tab>
          <Tabs.Tab value="links">{t("Links")}</Tabs.Tab>
          <Tabs.Tab value="activity">{t("Activity")}</Tabs.Tab>
          <Tabs.Tab value="actions">{t("Actions")}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="info" className={classes.panel}>
          <Stack gap="xs">
            <PeopleSection page={page} pageId={page.id} />
            <LifecycleSection page={page} />
            <MetadataSection page={page} />
            <StatsSection page={page} pageId={page.id} />
            <DisplaySection page={page} pageId={page.id} />
            <LockSection page={page} pageId={page.id} />
            <AccessSection page={page} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="links" className={classes.panel}>
          <LinksPanel pageId={page.id} canEdit={page.permissions?.canEdit ?? false} />
        </Tabs.Panel>

        <Tabs.Panel value="activity" className={classes.panel}>
          <ActivityPanel page={page} />
        </Tabs.Panel>

        <Tabs.Panel value="actions" className={classes.panel}>
          <ActionsSection page={page} pageId={page.id} />
          <DangerZoneSection page={page} pageId={page.id} />
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

function LifecycleSection({ page }: { page: IPage }) {
  const { t } = useTranslation();
  const { data: info } = usePageVerificationInfoQuery(page.id);
  const [manageOpened, { open: openManage, close: closeManage }] =
    useDisclosure(false);
  const submitReview = useSubmitForReviewMutation();
  const markObsolete = useMarkObsoleteMutation();

  const status = (info?.status ?? "none") as VerificationStatus;
  const canManage =
    info?.permissions?.canManage ?? page.permissions?.canEdit ?? false;
  const canVerify = info?.permissions?.canVerify ?? false;
  const isQms = info?.type === "qms";

  return (
    <>
      <p className={classes.statusRow}>
        <span className={classes.statusLabel}>
          <IconShieldCheck size={13} />
          {t("Lifecycle")}
        </span>
        <Badge size="sm" variant="light" color={statusTone(status)}>
          {status === "none" ? t("Not configured") : getStatusLabel(status, t)}
        </Badge>
      </p>

      {info?.expiresAt && (
        <p className={classes.statusRow}>
          <span className={classes.statusLabel}>
            <IconClock size={13} />
            {t("Review due")}
          </span>
          <span className={classes.statusValue}>
            {formattedDate(new Date(info.expiresAt))}
          </span>
        </p>
      )}

      <div className={classes.actions}>
        {status === "none" && canManage && (
          <Button size="xs" variant="light" onClick={openManage}>
            {t("Set up review")}
          </Button>
        )}

        {isQms &&
          canManage &&
          (status === "draft" || status === "needs_clarification") && (
            <Button
              size="xs"
              leftSection={<IconClipboardCheck size={14} />}
              onClick={() => submitReview.mutate(page.id)}
              loading={submitReview.isPending}
            >
              {t("Submit for review")}
            </Button>
          )}

        {status === "in_approval" && (
          <Button
            size="xs"
            component={Link}
            to={`/review/${page.slugId}`}
            leftSection={<IconChevronRight size={14} />}
          >
            {canVerify ? t("Open review") : t("View review")}
          </Button>
        )}

        {status === "approved" && info?.permissions?.canMarkObsolete && (
          <Button
            size="xs"
            variant="light"
            color="gray"
            leftSection={<IconArchive size={14} />}
            onClick={() => markObsolete.mutate(page.id)}
            loading={markObsolete.isPending}
          >
            {t("Mark obsolete")}
          </Button>
        )}

        {(canManage || status === "none") && status !== "none" && (
          <Button size="xs" variant="subtle" onClick={openManage}>
            {t("Manage review")}
          </Button>
        )}
      </div>

      {info?.verifiers && info.verifiers.length > 0 && (
        <div className={classes.verifierList}>
          <Text size="xs" c="dimmed" mt={6}>
            {t("Reviewers")}
          </Text>
          {info.verifiers.map((verifier) => (
            <div key={verifier.id} className={classes.verifier}>
              <Avatar
                src={verifier.avatarUrl}
                name={verifier.name}
                size={20}
                radius="xl"
              />
              <Text size="sm">{verifier.name}</Text>
            </div>
          ))}
        </div>
      )}

      <PageVerificationModal
        pageId={page.id}
        opened={manageOpened}
        onClose={closeManage}
      />
    </>
  );
}

function MetadataSection({ page }: { page: IPage }) {
  const { t } = useTranslation();
  const { data: metadata } = useDocMetadataQuery(page.id);
  const [opened, { open, close }] = useDisclosure(false);

  const classificationLabel = metadata?.classification
    ? t(
        DOC_CLASSIFICATIONS.find(
          (item) => item.value === metadata.classification,
        )?.label ?? "Unclassified",
      )
    : t("Unclassified");

  return (
    <>
      <p className={classes.statusRow}>
        <span className={classes.statusLabel}>
          <IconUser size={13} />
          {t("Owner")}
        </span>
        <span className={classes.statusValue}>
          {metadata
            ? metadata.owner?.name ?? t("Unassigned")
            : page.creator?.name ?? t("Unassigned")}
        </span>
      </p>
      <p className={classes.statusRow}>
        <span className={classes.statusLabel}>
          <IconUsers size={13} />
          {t("Reviewer")}
        </span>
        <span className={classes.statusValue}>
          {metadata?.reviewer?.name ?? t("Unassigned")}
        </span>
      </p>
      <p className={classes.statusRow}>
        <span className={classes.statusLabel}>
          <IconTag size={13} />
          {t("Classification")}
        </span>
        <span className={classes.statusValue}>{classificationLabel}</span>
      </p>
      {metadata?.archivedAt && (
        <p className={classes.statusRow}>
          <span className={classes.statusLabel}>
            <IconArchive size={13} />
            {t("Archived")}
          </span>
          <span className={classes.statusValue}>
            {formattedDate(new Date(metadata.archivedAt))}
          </span>
        </p>
      )}
      {metadata?.docType && (
        <p className={classes.statusRow}>
          <span className={classes.statusLabel}>
            <IconFileText size={13} />
            {t("Document type")}
          </span>
          <span className={classes.statusValue}>{metadata.docType}</span>
        </p>
      )}
      {metadata?.effectiveAt && (
        <p className={classes.statusRow}>
          <span className={classes.statusLabel}>
            <IconCalendar size={13} />
            {t("Effective date")}
          </span>
          <span className={classes.statusValue}>
            {formattedDate(new Date(metadata.effectiveAt))}
          </span>
        </p>
      )}
      {metadata?.reviewDueAt && (
        <p className={classes.statusRow}>
          <span className={classes.statusLabel}>
            <IconClock size={13} />
            {t("Review due")}
          </span>
          <span className={classes.statusValue}>
            {formattedDate(new Date(metadata.reviewDueAt))}
          </span>
        </p>
      )}

      {metadata?.canEdit && (
        <div className={classes.actions}>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPencil size={14} />}
            onClick={open}
          >
            {t("Edit metadata")}
          </Button>
        </div>
      )}

      <DocMetadataModal
        pageId={page.id}
        opened={opened}
        onClose={close}
      />
    </>
  );
}

function AccessSection({ page }: { page: IPage }) {
  const { t } = useTranslation();
  return (
    <p className={classes.statusRow}>
      <span className={classes.statusLabel}>
        <IconLock size={13} />
        {t("Access")}
      </span>
      <span className={classes.statusValue}>
        {page.permissions?.hasRestriction
          ? t("Restricted")
          : t("Space members")}
      </span>
    </p>
  );
}

function LinksPanel({
  pageId,
  canEdit,
}: {
  pageId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const { data: counts } = useBacklinksCountQuery(pageId);
  const [backlinksOpened, { open: openBacklinks, close: closeBacklinks }] =
    useDisclosure(false);

  return (
    <Stack gap="xs">
      <Text size="xs" fw={600} c="dimmed" tt="uppercase">
        {t("Backlinks")}
      </Text>
      <UnstyledButton className={classes.linkRow} onClick={openBacklinks}>
        <Group gap={7}>
          <IconLink size={14} />
          <Text size="sm">{t("Incoming links")}</Text>
        </Group>
        <Group gap={6}>
          <Text size="sm" fw={600}>
            {counts?.incoming ?? 0}
          </Text>
          <IconChevronRight size={14} opacity={0.5} />
        </Group>
      </UnstyledButton>
      <UnstyledButton className={classes.linkRow} onClick={openBacklinks}>
        <Group gap={7}>
          <IconLink size={14} />
          <Text size="sm">{t("Outgoing links")}</Text>
        </Group>
        <Group gap={6}>
          <Text size="sm" fw={600}>
            {counts?.outgoing ?? 0}
          </Text>
          <IconChevronRight size={14} opacity={0.5} />
        </Group>
      </UnstyledButton>

      <Divider my="xs" />
      <LabelsSection pageId={pageId} canEdit={canEdit} />

      <BacklinksModal
        pageId={pageId}
        opened={backlinksOpened}
        onClose={closeBacklinks}
      />
    </Stack>
  );
}

function ActivityPanel({ page }: { page: IPage }) {
  const { t } = useTranslation();
  const { data: info } = usePageVerificationInfoQuery(page.id);
  const setHistoryOpen = useSetAtom(historyAtoms);
  const updatedAgo = useTimeAgo(page.updatedAt);
  const status = (info?.status ?? "none") as VerificationStatus;

  return (
    <Stack gap="md">
      <Stack gap="xs">
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          {t("Document activity")}
        </Text>
        <div className={classes.statusRow}>
          <span className={classes.statusLabel}>
            <IconHistory size={13} />
            {t("Last updated")}
          </span>
          <span className={classes.statusValue}>{updatedAgo}</span>
        </div>
        <div className={classes.statusRow}>
          <span className={classes.statusLabel}>
            <IconShieldCheck size={13} />
            {t("Review status")}
          </span>
          <span className={classes.statusValue}>
            {status === "none" ? t("Not configured") : getStatusLabel(status, t)}
          </span>
        </div>
        {info?.verifiedAt && (
          <div className={classes.statusRow}>
            <span className={classes.statusLabel}>
              <IconCircleCheck size={13} />
              {t("Approved at")}
            </span>
            <span className={classes.statusValue}>
              {formattedDate(new Date(info.verifiedAt))}
            </span>
          </div>
        )}
        {info?.verifiedBy && (
          <div className={classes.statusRow}>
            <span className={classes.statusLabel}>
              <IconUsers size={13} />
              {t("Approved by")}
            </span>
            <span className={classes.statusValue}>{info.verifiedBy.name}</span>
          </div>
        )}
        {info?.rejectionComment && (
          <div className={classes.reviewNote}>
            <IconAlertTriangle size={13} /> {info.rejectionComment}
          </div>
        )}
      </Stack>

      <Button
        variant="default"
        size="xs"
        leftSection={<IconHistory size={14} />}
        onClick={() => setHistoryOpen(true)}
      >
        {t("Page history")}
      </Button>

      <HistoryModal pageId={page.id} pageTitle={page.title} />
    </Stack>
  );
}
