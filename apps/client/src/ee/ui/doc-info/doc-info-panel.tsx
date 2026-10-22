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
import sectionClasses from "@/ee/components/detail-info-panel/DetailInfoPanel.module.css";
import {
  ContentStatsSection,
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

const fmtDate = (value: string | Date) => formattedDate(new Date(value));

function StatusRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={classes.statusRow}>
      <span className={classes.statusLabel}>
        {icon}
        {label}
      </span>
      <span className={classes.statusValue}>{children}</span>
    </div>
  );
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
        aria-label={t("Document info")}
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
            <ContentStatsSection />
            <StatsSection page={page} pageId={page.id} />
            <p className={sectionClasses.sectionLabel}>{t("Details")}</p>
            <LifecycleSection page={page} />
            <MetadataSection page={page} />
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
      <StatusRow icon={<IconShieldCheck size={13} />} label={t("Lifecycle")}>
        <Badge size="sm" variant="light" color={statusTone(status)}>
          {status === "none" ? t("Not configured") : getStatusLabel(status, t)}
        </Badge>
      </StatusRow>

      {info?.expiresAt && (
        <StatusRow icon={<IconClock size={13} />} label={t("Review due")}>
          {fmtDate(info.expiresAt)}
        </StatusRow>
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
      <StatusRow icon={<IconUser size={13} />} label={t("Owner")}>
        {metadata
            ? metadata.owner?.name ?? t("Unassigned")
            : page.creator?.name ?? t("Unassigned")}
      </StatusRow>
      <StatusRow icon={<IconUsers size={13} />} label={t("Reviewer")}>
        {metadata?.reviewer?.name ?? t("Unassigned")}
      </StatusRow>
      <StatusRow icon={<IconTag size={13} />} label={t("Classification")}>
        {classificationLabel}
      </StatusRow>
      {metadata?.archivedAt && (
        <StatusRow icon={<IconArchive size={13} />} label={t("Archived")}>
          {fmtDate(metadata.archivedAt)}
        </StatusRow>
      )}
      {metadata?.docType && (
        <StatusRow icon={<IconFileText size={13} />} label={t("Document type")}>
          {metadata.docType}
        </StatusRow>
      )}
      {metadata?.effectiveAt && (
        <StatusRow icon={<IconCalendar size={13} />} label={t("Effective date")}>
          {fmtDate(metadata.effectiveAt)}
        </StatusRow>
      )}
      {metadata?.reviewDueAt && (
        <StatusRow icon={<IconClock size={13} />} label={t("Review due")}>
          {fmtDate(metadata.reviewDueAt)}
        </StatusRow>
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
    <StatusRow icon={<IconLock size={13} />} label={t("Access")}>
      {page.permissions?.hasRestriction
          ? t("Restricted")
          : t("Space members")}
    </StatusRow>
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
        <StatusRow icon={<IconHistory size={13} />} label={t("Last updated")}>
          {updatedAgo}
        </StatusRow>
        <StatusRow icon={<IconShieldCheck size={13} />} label={t("Review status")}>
          {status === "none" ? t("Not configured") : getStatusLabel(status, t)}
        </StatusRow>
        {info?.verifiedAt && (
          <StatusRow icon={<IconCircleCheck size={13} />} label={t("Approved at")}>
            {fmtDate(info.verifiedAt)}
          </StatusRow>
        )}
        {info?.verifiedBy && (
          <StatusRow icon={<IconUsers size={13} />} label={t("Approved by")}>
            {info.verifiedBy.name}
          </StatusRow>
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
