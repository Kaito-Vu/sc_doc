import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useParams } from "react-router-dom";
import {
  activeHistoryIdAtom,
  historyAtoms,
} from "@/features/page-history/atoms/history-atoms";
import { restorePageHistory } from "@/features/page-history/services/page-history-service";
import { invalidatePageHistoryCache } from "@/features/page-history/queries/page-history-query";
import { extractPageSlugId } from "@/lib";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type";

export function useHistoryRestore() {
  const { t } = useTranslation();

  const activeHistoryId = useAtomValue(activeHistoryIdAtom);
  const setHistoryModalOpen = useSetAtom(historyAtoms);
  const [isRestoring, setIsRestoring] = useState(false);

  const { spaceSlug, pageSlug } = useParams();
  const pageId = extractPageSlugId(pageSlug);
  const { data: space } = useSpaceQuery(spaceSlug);
  const spaceAbility = useSpaceAbility(space?.membership?.permissions);

  const canRestore = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Page,
  );

  const handleRestore = useCallback(async () => {
    if (!activeHistoryId) return;

    setIsRestoring(true);
    try {
      // server-side restore: it snapshots the current live content before
      // overwriting it, so no unsaved/very-recent edits can be lost
      await restorePageHistory(activeHistoryId);
      invalidatePageHistoryCache(pageId);
      setHistoryModalOpen(false);
      notifications.show({ message: t("Successfully restored") });
    } catch (err: any) {
      notifications.show({
        color: "red",
        message: err?.response?.data?.message ?? t("Failed to restore version"),
      });
    } finally {
      setIsRestoring(false);
    }
  }, [activeHistoryId, pageId, setHistoryModalOpen, t]);

  const confirmRestore = useCallback(() => {
    modals.openConfirmModal({
      title: t("Please confirm your action"),
      children: (
        <Text size="sm">
          {t(
            "Are you sure you want to restore this version? Any changes not versioned will be lost.",
          )}
        </Text>
      ),
      labels: { confirm: t("Confirm"), cancel: t("Cancel") },
      onConfirm: handleRestore,
    });
  }, [t, handleRestore]);

  return { canRestore, confirmRestore, isRestoring };
}
