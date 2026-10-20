import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Container,
  Group,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import {
  IconChevronRight,
  IconFileText,
  IconPencil,
  IconSearch,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import {
  useDocMetadataHealthQuery,
  useDocMetadataListQuery,
} from "@/ee/docs";
import type {
  DocClassification,
  DocMetadata,
  DocMetadataFilter,
} from "@/ee/docs/types";
import { DOC_CLASSIFICATIONS } from "@/ee/docs/types";
import { getStatusLabel } from "@/ee/page-verification/components/verification-status";
import type { VerificationStatus } from "@/ee/page-verification/types/page-verification.types";
import { buildPageUrl } from "@/features/page/page.utils";
import { formattedDate } from "@/lib/time";
import { DocumentTitle } from "@/components/ui/document-title";
import { EmptyState } from "@/components/ui/empty-state";
import { DocMetadataModal } from "@/ee/ui/doc-info/doc-metadata-modal";
import classes from "./document-library-page.module.css";

function toneFor(doc: DocMetadata): string {
  if (doc.archivedAt) return "gray";
  switch (doc.verificationStatus) {
    case "approved":
    case "verified":
      return "blue";
    case "in_approval":
    case "needs_clarification":
      return "orange";
    case "expired":
      return "red";
    default:
      return "gray";
  }
}

function statusText(doc: DocMetadata, t: (key: string) => string) {
  if (doc.archivedAt) return t("Archived");
  if (!doc.verificationStatus) return t("No review workflow");
  return getStatusLabel(doc.verificationStatus as VerificationStatus, t);
}

export function DocumentLibraryPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<DocMetadataFilter>("all");
  const [classification, setClassification] =
    useState<DocClassification | null>(null);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [offset, setOffset] = useState(0);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [metadataOpened, { open: openMetadata, close: closeMetadata }] =
    useDisclosure(false);

  const { data: spacesData } = useGetSpacesQuery({ limit: 100 });
  const spaceIds = spaceId ? [spaceId] : undefined;

  const { data: health } = useDocMetadataHealthQuery(spaceIds);
  const { data, isLoading } = useDocMetadataListQuery({
    filter,
    classification: classification ?? undefined,
    spaceIds,
    query: debouncedQuery || undefined,
    limit: 50,
    offset,
  });

  const items = data?.items ?? [];

  const healthCards = useMemo(
    () => [
      {
        key: "all" as const,
        label: t("Tracked documents"),
        value: health?.total,
      },
      {
        key: "missing-owner" as const,
        label: t("Missing owner"),
        value: health?.missingOwner,
      },
      {
        key: "missing-classification" as const,
        label: t("Missing classification"),
        value: health?.missingClassification,
      },
      {
        key: "review-overdue" as const,
        label: t("Review overdue"),
        value: health?.reviewOverdue,
      },
      {
        key: "in-review" as const,
        label: t("In review"),
        value: health?.inReview,
      },
      {
        key: "archived" as const,
        label: t("Archived"),
        value: health?.archived,
      },
      {
        key: "orphan" as const,
        label: t("Orphan documents"),
        value: health?.orphan,
      },
      {
        key: "duplicate-titles" as const,
        label: t("Duplicate titles"),
        value: health?.duplicateTitles,
      },
    ],
    [health, t],
  );

  const resetOffset = () => setOffset(0);

  return (
    <>
      <DocumentTitle title={t("Document library")} />
      <Container size={1100} pt="xl" pb={80}>
        <Stack gap="lg">
          <div>
            <Text component="h1" fw={650} fz="h3" m={0}>
              {t("Document library")}
            </Text>
            <Text size="sm" c="dimmed" mt={4}>
              {t(
                "Manage ownership, classification, review dates, and document health.",
              )}
            </Text>
          </div>

          <div className={classes.healthGrid}>
            {healthCards.map((card) => (
              <UnstyledButton
                key={card.key}
                className={classes.healthCard}
                data-active={filter === card.key || undefined}
                onClick={() => {
                  setFilter(card.key);
                  resetOffset();
                }}
              >
                <span className={classes.healthValue}>{card.value ?? 0}</span>
                <span className={classes.healthLabel}>{card.label}</span>
              </UnstyledButton>
            ))}
          </div>

          <div className={classes.filters}>
            <TextInput
              size="xs"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                resetOffset();
              }}
              placeholder={t("Search documents")}
              leftSection={<IconSearch size={14} />}
              w={240}
              aria-label={t("Search documents")}
            />
            <Select
              size="xs"
              placeholder={t("All spaces")}
              data={(spacesData?.items ?? []).map((space) => ({
                value: space.id,
                label: space.name,
              }))}
              value={spaceId}
              onChange={(value) => {
                setSpaceId(value);
                resetOffset();
              }}
              clearable
              searchable
              w={190}
              aria-label={t("Filter by space")}
            />
            <Select
              size="xs"
              placeholder={t("All classifications")}
              data={DOC_CLASSIFICATIONS.map((item) => ({
                value: item.value,
                label: t(item.label),
              }))}
              value={classification}
              onChange={(value) => {
                setClassification((value as DocClassification) ?? null);
                resetOffset();
              }}
              clearable
              w={190}
              aria-label={t("Filter by classification")}
            />
          </div>

          {isLoading ? (
            <Text size="sm" c="dimmed">
              {t("Loading...")}
            </Text>
          ) : items.length === 0 ? (
            <EmptyState
              icon={IconFileText}
              title={t("No documents found")}
              description={t(
                "Documents appear here once they have metadata or match the selected filter.",
              )}
            />
          ) : (
            <Table.ScrollContainer minWidth={760}>
              <Table highlightOnHover verticalSpacing="sm">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t("Document")}</Table.Th>
                    <Table.Th visibleFrom="sm">{t("Space")}</Table.Th>
                    <Table.Th visibleFrom="md">{t("Owner")}</Table.Th>
                    <Table.Th visibleFrom="md">
                      {t("Classification")}
                    </Table.Th>
                    <Table.Th visibleFrom="lg">{t("Review due")}</Table.Th>
                    <Table.Th>{t("Status")}</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {items.map((doc) => (
                    <Table.Tr key={doc.pageId}>
                      <Table.Td>
                        <Link
                          className={classes.docTitle}
                          to={buildPageUrl(
                            doc.spaceSlug,
                            doc.pageSlugId ?? "",
                            doc.pageTitle ?? undefined,
                          )}
                        >
                          <IconFileText size={16} />
                          <Text size="sm" fw={550} lineClamp={1}>
                            {doc.pageTitle || t("Untitled")}
                          </Text>
                        </Link>
                      </Table.Td>
                      <Table.Td visibleFrom="sm">
                        <Text size="xs" c="dimmed">
                          {doc.spaceName}
                        </Text>
                      </Table.Td>
                      <Table.Td visibleFrom="md">
                        <Text size="xs">
                          {doc.owner?.name ?? t("Unassigned")}
                        </Text>
                      </Table.Td>
                      <Table.Td visibleFrom="md">
                        <Text size="xs">
                          {doc.classification
                            ? t(
                                DOC_CLASSIFICATIONS.find(
                                  (item) =>
                                    item.value === doc.classification,
                                )?.label ?? "Unclassified",
                              )
                            : t("Unclassified")}
                        </Text>
                      </Table.Td>
                      <Table.Td visibleFrom="lg">
                        <Text size="xs" c="dimmed">
                          {doc.reviewDueAt
                            ? formattedDate(new Date(doc.reviewDueAt))
                            : "—"}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge size="xs" variant="light" color={toneFor(doc)}>
                          {statusText(doc, t)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} justify="flex-end" wrap="nowrap">
                          {doc.canEdit && (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              leftSection={<IconPencil size={12} />}
                              onClick={() => {
                                setSelectedPageId(doc.pageId);
                                openMetadata();
                              }}
                            >
                              {t("Edit")}
                            </Button>
                          )}
                          <UnstyledButton
                            component={Link}
                            to={buildPageUrl(
                              doc.spaceSlug,
                              doc.pageSlugId ?? "",
                              doc.pageTitle ?? undefined,
                            )}
                            aria-label={t("Open document")}
                          >
                            <IconChevronRight size={16} />
                          </UnstyledButton>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}

          <Group justify="space-between">
            <Button
              variant="default"
              size="xs"
              disabled={offset === 0}
              onClick={() => setOffset((value) => Math.max(0, value - 50))}
            >
              {t("Previous")}
            </Button>
            <Button
              variant="default"
              size="xs"
              disabled={!data?.hasMore}
              onClick={() => setOffset((value) => value + 50)}
            >
              {t("Next")}
            </Button>
          </Group>
        </Stack>
      </Container>

      {selectedPageId && (
        <DocMetadataModal
          pageId={selectedPageId}
          opened={metadataOpened}
          onClose={closeMetadata}
        />
      )}
    </>
  );
}
