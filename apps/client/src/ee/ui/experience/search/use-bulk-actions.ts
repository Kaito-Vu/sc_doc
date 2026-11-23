import { createElement, useState, type ElementType } from "react";
import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  IAttachmentSearch,
  IPageSearch,
} from "@/features/search/types/search.types";
import { addLabelsToPage } from "@/features/label/services/label-service";
import { exportPage, deletePage } from "@/features/page/services/page-service";
import { ExportFormat } from "@/features/page/types/page.types";
import { buildPageUrl } from "@/features/page/page.utils";

type SearchResult = IPageSearch | IAttachmentSearch;

export function getSelectedPageIds(
  results: SearchResult[],
  selected: Set<string>,
): string[] {
  return results
    .filter((result) => selected.has(result.id))
    .map((result) => ("fileName" in result ? result.pageId : result.id));
}

export function hrefOf(result: SearchResult): string {
  if ("fileName" in result) {
    return buildPageUrl(
      result.space.slug,
      result.page.slugId,
      result.page.title,
    );
  }
  return buildPageUrl(result.space.slug, result.slugId, result.title);
}

type Params = {
  selected: Set<string>;
  selectedPageIds: string[];
  results: SearchResult[];
  /** Called after a bulk action that should clear the selection. */
  onDone: () => void;
};

export function useBulkActions({
  selected,
  selectedPageIds,
  results,
  onDone,
}: Params) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [bulkLoading, setBulkLoading] = useState(false);

  /** Resolves true when the label was applied to every selected page. */
  const bulkLabel = async (rawName: string): Promise<boolean> => {
    const name = rawName.trim();
    if (!name || selectedPageIds.length === 0) return false;
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
      onDone();
      return true;
    } catch {
      notifications.show({
        message: t("Failed to add label"),
        color: "red",
      });
      return false;
    } finally {
      setBulkLoading(false);
    }
  };

  const copyLinks = async () => {
    const links = [...selected]
      .map((id) => results.find((result) => result.id === id))
      .filter(Boolean)
      .map((result) => `${window.location.origin}${hrefOf(result as SearchResult)}`);
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

  const exportSelected = async () => {
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

  const trashSelected = () => {
    const count = selected.size;
    modals.openConfirmModal({
      title: t("Move to trash"),
      children: createElement(
        // Mantine's polymorphic Text defeats createElement's overloads
        Text as ElementType,
        { size: "sm" },
        t("Move {{count}} documents to trash?", { count }),
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
          onDone();
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

  return { bulkLoading, bulkLabel, copyLinks, exportSelected, trashSelected };
}
