import { useMemo, useState } from "react";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Container,
  Divider,
  Group,
  Loader,
  Modal,
  MultiSelect,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconBookmark,
  IconCopy,
  IconDownload,
  IconFileText,
  IconSearch,
  IconTag,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { useUnifiedSearch } from "@/features/search/hooks/use-unified-search";
import type {
  IAttachmentSearch,
  IPageSearch,
} from "@/features/search/types/search.types";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { useWorkspaceLabelsQuery } from "@/features/label/queries/label-query";
import { addLabelsToPage } from "@/features/label/services/label-service";
import { exportPage, deletePage } from "@/features/page/services/page-service";
import { ExportFormat } from "@/features/page/types/page.types";
import { buildPageUrl } from "@/features/page/page.utils";
import { formattedDate } from "@/lib/time";
import { DocumentTitle } from "@/components/ui/document-title";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import {
  savedSearchViewsAtom,
  type SavedSearchView,
} from "../atoms";
import classes from "./search-page.module.css";

export function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [storedViews, setViews] = useAtom(savedSearchViewsAtom);
  const views = Array.isArray(storedViews) ? storedViews : [];
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(query, 300);
  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [contentType, setContentType] = useState<"page" | "attachment">("page");
  const [titleOnly, setTitleOnly] = useState(false);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveOpened, setSaveOpened] = useState(false);
  const [viewName, setViewName] = useState("");
  const [labelOpened, setLabelOpened] = useState(false);
  const [labelName, setLabelName] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const hasAttachmentIndexing = useHasFeature(Feature.ATTACHMENT_INDEXING);

  const { data: spacesData } = useGetSpacesQuery({ limit: 100 });
  const { data: labelsData } = useWorkspaceLabelsQuery("", true);
  const { data, isFetching } = useUnifiedSearch(
    {
      query: debouncedQuery,
      spaceId: spaceId ?? undefined,
      contentType,
      titleOnly,
      labelIds: labelIds.length > 0 ? labelIds : undefined,
    },
    true,
  );

  const results = useMemo(
    () => (data ?? []).filter(Boolean),
    [data],
  );

  const selectedResults = results.filter((result) =>
    selected.has(result.id),
  );
  const selectedPageIds = selectedResults.map((result) =>
    "fileName" in result ? result.pageId : result.id,
  );

  const canSearch =
    debouncedQuery.trim().length > 0 || labelIds.length > 0;

  const resetSelection = () => setSelected(new Set());

  const applyView = (view: SavedSearchView) => {
    setQuery(view.query);
    setSpaceId(view.spaceId ?? null);
    setContentType(view.contentType);
    setTitleOnly(!!view.titleOnly);
    resetSelection();
  };

  const saveView = () => {
    const name = viewName.trim();
    if (!name) return;
    const view: SavedSearchView = {
      id: `${Date.now()}`,
      name,
      query,
      spaceId,
      contentType,
      titleOnly,
    };
    setViews((current) => [
      view,
      ...(Array.isArray(current) ? current : []),
    ].slice(0, 12));
    setViewName("");
    setSaveOpened(false);
  };

  const removeView = (id: string) => {
    setViews((current) =>
      (Array.isArray(current) ? current : []).filter(
        (view) => view.id !== id,
      ),
    );
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedResults.length === results.length) {
      resetSelection();
    } else {
      setSelected(new Set(results.map((result) => result.id)));
    }
  };

  const pageOf = (result: IPageSearch | IAttachmentSearch) =>
    "fileName" in result ? result.page : result;

  const hrefOf = (result: IPageSearch | IAttachmentSearch) => {
    if ("fileName" in result) {
      return buildPageUrl(
        result.space.slug,
        result.page.slugId,
        result.page.title,
      );
    }
    return buildPageUrl(result.space.slug, result.slugId, result.title);
  };

  const handleBulkLabel = async () => {
    const name = labelName.trim();
    if (!name || selectedPageIds.length === 0) return;
    setBulkLoading(true);
    try {
      await Promise.all(
        selectedPageIds.map((pageId) =>
          addLabelsToPage({ pageId, names: [name] }),
        ),
      );
      notifications.show({
        message: t("Label added to {{count}} documents", {
          count: selectedPageIds.length,
        }),
      });
      setLabelName("");
      setLabelOpened(false);
      resetSelection();
    } catch {
      notifications.show({
        message: t("Failed to add label"),
        color: "red",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkCopyLinks = async () => {
    const links = [...selected]
      .map((id) => results.find((result) => result.id === id))
      .filter(Boolean)
      .map((result) => {
        const url = hrefOf(result as IPageSearch | IAttachmentSearch);
        return `${window.location.origin}${url}`;
      });
    try {
      await navigator.clipboard.writeText(links.join("\n"));
      notifications.show({ message: t("Links copied") });
    } catch {
      notifications.show({
        message: t("Failed to copy links"),
        color: "red",
      });
    }
  };

  const handleBulkExport = async () => {
    setBulkLoading(true);
    try {
      for (const pageId of selectedPageIds) {
        await exportPage({ pageId, format: ExportFormat.Markdown });
      }
      notifications.show({
        message: t("Export started for {{count}} documents", {
          count: selectedPageIds.length,
        }),
      });
    } catch {
      notifications.show({ message: t("Export failed"), color: "red" });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkTrash = () => {
    const count = selected.size;
    modals.openConfirmModal({
      title: t("Move to trash"),
      children: (
        <Text size="sm">
          {t("Move {{count}} documents to trash?", { count })}
        </Text>
      ),
      labels: { confirm: t("Move to trash"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        setBulkLoading(true);
        try {
          for (const pageId of selectedPageIds) {
            await deletePage(pageId, false);
          }
          notifications.show({
            message: t("Moved {{count}} documents to trash", {
              count: selectedPageIds.length,
            }),
          });
          queryClient.invalidateQueries({ queryKey: ["unified-search"] });
          resetSelection();
        } catch {
          notifications.show({
            message: t("Failed to move documents to trash"),
            color: "red",
          });
        } finally {
          setBulkLoading(false);
        }
      },
    });
  };

  return (
    <>
      <DocumentTitle title={t("Search")} />
      <Container size={1000} pt="xl" pb={120}>
        <Stack gap="lg">
          <div>
            <Text component="h1" fw={650} fz="h3" m={0}>
              {t("Search")}
            </Text>
            <Text size="sm" c="dimmed" mt={4}>
              {t("Find pages across your workspace, save views, and act in bulk.")}
            </Text>
          </div>

          <div className={classes.searchBox}>
            <TextInput
              size="lg"
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                resetSelection();
              }}
              placeholder={t("Search documents...")}
              aria-label={t("Search documents...")}
              leftSection={<IconSearch size={18} />}
              rightSection={
                isFetching ? (
                  <Loader size="xs" />
                ) : query ? (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={t("Clear search")}
                    onClick={() => {
                      setQuery("");
                      resetSelection();
                    }}
                  >
                    <IconX size={16} />
                  </ActionIcon>
                ) : null
              }
            />

            <Group gap="sm" mt="sm" wrap="wrap">
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
                  resetSelection();
                }}
                clearable
                searchable
                w={180}
                aria-label={t("Filter by space")}
              />
              <SegmentedControl
                size="xs"
                value={contentType}
                onChange={(value) => {
                  setContentType(value as "page" | "attachment");
                  resetSelection();
                }}
                data={[
                  { value: "page", label: t("Pages") },
                  ...(hasAttachmentIndexing
                    ? [{ value: "attachment", label: t("Attachments") }]
                    : []),
                ]}
                aria-label={t("Content type")}
              />
              <MultiSelect
                size="xs"
                placeholder={t("Labels")}
                data={(labelsData?.items ?? []).map((label) => ({
                  value: label.id,
                  label: label.name,
                }))}
                value={labelIds}
                onChange={(value) => {
                  setLabelIds(value);
                  resetSelection();
                }}
                clearable
                searchable
                w={190}
                aria-label={t("Filter by label")}
              />
              <Switch
                size="xs"
                label={t("Title only")}
                checked={titleOnly}
                onChange={(event) => {
                  setTitleOnly(event.currentTarget.checked);
                  resetSelection();
                }}
              />
              <Button
                size="xs"
                variant="default"
                leftSection={<IconBookmark size={14} />}
                onClick={() => setSaveOpened(true)}
                disabled={!canSearch}
              >
                {t("Save view")}
              </Button>
            </Group>
          </div>

          {views.length > 0 && (
            <Group gap="xs" wrap="wrap">
              <Text size="xs" c="dimmed">
                {t("Saved views")}
              </Text>
              {views.map((view) => (
                <Group key={view.id} gap={2} wrap="nowrap">
                  <Badge
                    component="button"
                    type="button"
                    variant="light"
                    color="gray"
                    aria-label={t("Apply saved view {{name}}", {
                      name: view.name,
                    })}
                    className={classes.savedView}
                    style={{ cursor: "pointer" }}
                    onClick={() => applyView(view)}
                  >
                    {view.name}
                  </Badge>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="gray"
                    aria-label={t("Remove saved view {{name}}", {
                      name: view.name,
                    })}
                    onClick={() => removeView(view.id)}
                  >
                    <IconX size={12} />
                  </ActionIcon>
                </Group>
              ))}
            </Group>
          )}

          <Divider />

          <VisuallyHidden role="status" aria-live="polite">
            {isFetching
              ? t("Searching...")
              : canSearch
                ? t("{{count}} results", { count: results.length })
                : ""}
          </VisuallyHidden>

          {!canSearch ? (
            <Paper p="xl" withBorder radius="md">
              <Text size="sm" c="dimmed" ta="center">
                {t(
                  "Start typing to search, or choose a label to browse documents.",
                )}
              </Text>
            </Paper>
          ) : results.length === 0 && !isFetching ? (
            <Paper p="xl" withBorder radius="md">
              <Text size="sm" c="dimmed" ta="center">
                {t("No documents found.")}
              </Text>
            </Paper>
          ) : (
            <Stack gap="xs">
              <Group justify="space-between">
                <Checkbox
                  size="xs"
                  label={t("Select all")}
                  checked={
                    results.length > 0 &&
                    selectedResults.length === results.length
                  }
                  indeterminate={
                    selectedResults.length > 0 &&
                    selectedResults.length < results.length
                  }
                  onChange={toggleAll}
                />
                <Text size="xs" c="dimmed">
                  {t("{{count}} results", { count: results.length })}
                </Text>
              </Group>

              {results.map((result) => {
                const isAttachment = "fileName" in result;
                const title = isAttachment
                  ? (result as IAttachmentSearch).fileName
                  : (result as IPageSearch).title || t("Untitled");
                const highlight = result.highlight;
                const pageInfo = pageOf(result);
                const isSelected = selected.has(result.id);

                return (
                  <div
                    key={result.id}
                    className={classes.resultRow}
                    data-selected={isSelected || undefined}
                  >
                    <Checkbox
                      size="xs"
                      checked={isSelected}
                      onChange={() => toggleSelected(result.id)}
                      aria-label={t("Select {{title}}", { title })}
                    />
                    <UnstyledButton
                      className={classes.resultMain}
                      onClick={() => navigate(hrefOf(result))}
                    >
                      <span className={classes.iconBox}>
                        <IconFileText size={16} />
                      </span>
                      <span className={classes.resultBody}>
                        <span className={classes.resultTitle}>{title}</span>
                        <span className={classes.resultMeta}>
                          {"space" in result && result.space?.name
                            ? result.space.name
                            : ""}
                          {pageInfo?.title && isAttachment
                            ? ` · ${pageInfo.title}`
                            : ""}
                          {" · "}
                          {formattedDate(
                            new Date(
                              isAttachment
                                ? (result as IAttachmentSearch).updatedAt
                                : (result as IPageSearch).updatedAt,
                            ),
                          )}
                        </span>
                        {highlight && (
                          <span
                            className={classes.highlight}
                            dangerouslySetInnerHTML={{
                              __html: DOMPurify.sanitize(highlight, {
                                ALLOWED_TAGS: ["mark", "em", "strong", "b"],
                                ALLOWED_ATTR: [],
                              }),
                            }}
                          />
                        )}
                      </span>
                    </UnstyledButton>
                  </div>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Container>

      {selected.size > 0 && (
        <Paper className={classes.bulkBar} shadow="lg" radius="md" withBorder>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={600}>
              {t("{{count}} selected", { count: selected.size })}
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Tooltip label={t("Add label")} withArrow>
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<IconTag size={14} />}
                  onClick={() => setLabelOpened(true)}
                >
                  {t("Label")}
                </Button>
              </Tooltip>
              <Tooltip label={t("Copy links")} withArrow>
                <ActionIcon
                  variant="default"
                  onClick={handleBulkCopyLinks}
                  aria-label={t("Copy links")}
                >
                  <IconCopy size={16} />
                </ActionIcon>
              </Tooltip>
              {contentType === "page" && (
                <>
                  <Tooltip label={t("Export")} withArrow>
                    <ActionIcon
                      variant="default"
                      onClick={handleBulkExport}
                      loading={bulkLoading}
                      aria-label={t("Export")}
                    >
                      <IconDownload size={16} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={t("Move to trash")} withArrow>
                    <ActionIcon
                      variant="default"
                      color="red"
                      onClick={handleBulkTrash}
                      aria-label={t("Move to trash")}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
              <Button size="xs" variant="subtle" onClick={resetSelection}>
                {t("Clear")}
              </Button>
            </Group>
          </Group>
        </Paper>
      )}

      <Modal
        opened={saveOpened}
        onClose={() => setSaveOpened(false)}
        title={t("Save search view")}
        centered
      >
        <Stack gap="md">
          <TextInput
            value={viewName}
            onChange={(event) => setViewName(event.currentTarget.value)}
            label={t("View name")}
            placeholder={t("e.g. Policies to review")}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setSaveOpened(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveView} disabled={!viewName.trim()}>
              {t("Save")}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={labelOpened}
        onClose={() => setLabelOpened(false)}
        title={t("Add label")}
        centered
      >
        <Stack gap="md">
          <TextInput
            value={labelName}
            onChange={(event) => setLabelName(event.currentTarget.value)}
            label={t("Label name")}
            placeholder={t("e.g. needs-review")}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setLabelOpened(false)}>
              {t("Cancel")}
            </Button>
            <Button
              onClick={handleBulkLabel}
              loading={bulkLoading}
              disabled={!labelName.trim()}
            >
              {t("Add label")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
