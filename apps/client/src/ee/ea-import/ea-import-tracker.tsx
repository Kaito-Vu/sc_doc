import { useEffect, useRef, useState } from "react";
import { Button, Group, Progress, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { IFileTask } from "@/features/file-task/types/file-task.types.ts";
import { getFileTaskById } from "@/features/file-task/services/file-task-service.ts";
import { queryClient } from "@/main.tsx";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import { useRefreshSubPages } from "@/ee/import-subpage/use-refresh-sub-pages.ts";
import { getErrorMessage } from "@/ee/ea-import/get-error-message.ts";
import {
  cancelEaImport,
  EaImportMode,
  getActiveEaImports,
  importEaXml,
} from "@/ee/ea-import/services/ea-import-service.ts";

const POLL_MS = 1000;
// Consecutive poll failures before the toast admits the connection is lost.
const LOST_AFTER_FAILS = 5;
// The server commits all pages in one transaction after this point.
const POINT_OF_NO_RETURN = 92;

type Listener = (task: IFileTask, file?: File) => void;
const listeners = new Set<Listener>();

/** Hand a freshly uploaded EA import to the tracker (called from the import modal). */
export function trackEaImport(task: IFileTask, file?: File) {
  listeners.forEach((listener) => listener(task, file));
}

/**
 * Mounted once in the global layout: follows EA imports through a status bar
 * notification. Running imports are discovered from the server, so a page
 * reload (F5) resumes the bar instead of losing it.
 */
export function EaImportTracker() {
  const { t } = useTranslation();
  const emit = useQueryEmit();
  const refreshSubPages = useRefreshSubPages();
  const [ids, setIds] = useState<string[]>([]);
  const files = useRef(new Map<string, File>());
  const shown = useRef(new Set<string>());
  const finished = useRef(new Set<string>());
  const canceling = useRef(new Set<string>());
  const fails = useRef(new Map<string, number>());
  const lastTask = useRef(new Map<string, IFileTask>());
  const inFlight = useRef(new Set<string>());

  const notifId = (task: IFileTask) => `ea-import-${task.id}`;

  const confirmCancel = (task: IFileTask) =>
    modals.openConfirmModal({
      title: t("Cancel import?"),
      centered: true,
      children: (
        <Text size="sm">
          {t("Pages already read from this file will not be created.")}
        </Text>
      ),
      labels: { confirm: t("Cancel import"), cancel: t("Keep importing") },
      confirmProps: { color: "red" },
      onConfirm: () => {
        canceling.current.add(task.id);
        renderProgress(lastTask.current.get(task.id) ?? task);
        cancelEaImport(task.id).catch((err) => {
          canceling.current.delete(task.id);
          renderProgress(lastTask.current.get(task.id) ?? task);
          notifications.show({
            color: "red",
            title: t("Failed to cancel import"),
            message: getErrorMessage(err),
          });
        });
      },
    });

  const renderProgress = (task: IFileTask) => {
    const progress = (task.metadata as any)?.progress as number | undefined;
    lastTask.current.set(task.id, task);
    const isCanceling = canceling.current.has(task.id);
    const lost = (fails.current.get(task.id) ?? 0) >= LOST_AFTER_FAILS;
    const cancelable = (progress ?? 0) < POINT_OF_NO_RETURN;
    const statusText = lost
      ? t("Connection lost, retrying…")
      : isCanceling
        ? t("Canceling…")
        : progress === undefined
          ? t("Queued…")
          : `${progress}%`;
    const props = {
      id: notifId(task),
      title: t("Importing pages"),
      loading: true,
      autoClose: false as const,
      withCloseButton: false,
      message: (
        <Stack gap={6}>
          <Text size="sm" lineClamp={1}>
            {task.fileName}
          </Text>
          <Progress
            value={progress ?? 0}
            size="sm"
            animated
            aria-label={t("Importing pages")}
          />
          <Group justify="space-between">
            <Text
              size="xs"
              c={lost ? "red" : "dimmed"}
              role="status"
              aria-live="polite"
            >
              {statusText}
            </Text>
            {cancelable ? (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                disabled={isCanceling}
                onClick={() => confirmCancel(task)}
              >
                {t("Cancel")}
              </Button>
            ) : (
              <Text size="xs" c="dimmed">
                {t("Saving pages, can't be canceled")}
              </Text>
            )}
          </Group>
        </Stack>
      ),
    };
    if (shown.current.has(task.id)) {
      notifications.update(props);
    } else {
      shown.current.add(task.id);
      notifications.show(props);
    }
  };

  const addTask = (task: IFileTask) => {
    renderProgress(task);
    setIds((prev) => (prev.includes(task.id) ? prev : [...prev, task.id]));
  };

  const askDuplicate = (task: IFileTask, file: File) => {
    const run = (mode: EaImportMode) => {
      modals.closeAll();
      importEaXml(file, task.spaceId, mode, (task.metadata as any)?.parentPageId)
        .then((next) => {
          files.current.set(next.id, file);
          addTask(next);
        })
        .catch((err) =>
          notifications.show({
            color: "red",
            title: t("Failed to upload import file"),
            message: getErrorMessage(err),
          }),
        );
    };
    modals.open({
      title: t("Package already imported"),
      centered: true,
      children: (
        <Stack gap="lg">
          <Text size="sm">
            {t(
              "This Enterprise Architect package was already imported into this space. Choose how to proceed:",
            )}
          </Text>
          <Stack gap="xs">
            <Button onClick={() => run("merge")}>
              {t("Update (recommended)")}
            </Button>
            <Text size="xs" c="dimmed">
              {t(
                "Fills empty pages with the content in this file ({{content}} pages with content, {{stubs}} title-only pages). Pages that already have content are never overwritten.",
                {
                  content: (task.metadata as any)?.contentPages ?? 0,
                  stubs: (task.metadata as any)?.stubPages ?? 0,
                },
              )}
            </Text>
            <Button variant="default" onClick={() => run("keep")}>
              {t("Keep both")}
            </Button>
            <Button variant="default" onClick={() => modals.closeAll()}>
              {t("Skip")}
            </Button>
            <Button color="red" variant="outline" onClick={() => run("replace")}>
              {t("Replace")}
            </Button>
            <Text size="xs" c="dimmed">
              {t(
                "Replace permanently deletes the pages from the previous import.",
              )}
            </Text>
          </Stack>
        </Stack>
      ),
    });
  };

  const finish = async (task: IFileTask) => {
    const id = notifId(task);
    const done = { id, loading: false, withCloseButton: true };
    const meta = task.metadata as any;

    if (task.status === "canceled") {
      notifications.update({
        ...done,
        color: "gray",
        title: t("Import canceled"),
        message: task.fileName,
        autoClose: 4000,
      });
    } else if (task.status === "failed") {
      notifications.update({
        ...done,
        color: "red",
        title: t("Page import failed"),
        message: t("Something went wrong while importing pages: {{reason}}.", {
          reason: task.errorMessage || t("unknown error"),
        }),
        icon: <IconX size={18} />,
        autoClose: false,
      });
    } else if (meta?.duplicate === true) {
      const file = files.current.get(task.id);
      if (file) {
        notifications.hide(id);
        askDuplicate(task, file);
      } else {
        // The file is gone after a reload; nothing to re-upload.
        notifications.update({
          ...done,
          color: "yellow",
          title: t("Import skipped"),
          message: t(
            "This Enterprise Architect package was already imported into this space.",
          ),
          autoClose: false,
        });
      }
    } else {
      notifications.update({
        ...done,
        color: "teal",
        title: t("Import complete"),
        message: meta?.merge
          ? t(
              "{{added}} added, {{filled}} filled, {{kept}} unchanged, {{skipped}} skipped (already had content).",
              { ...meta.merge },
            ) as string
          : t("Your pages were successfully imported."),
        icon: <IconCheck size={18} />,
        autoClose: false,
      });
      try {
        await queryClient.refetchQueries({
          queryKey: ["root-sidebar-pages", task.spaceId],
        });
        await queryClient.invalidateQueries({
          queryKey: ["recent-changes", task.spaceId],
        });
        if (meta?.parentPageId) {
          await refreshSubPages(meta.parentPageId, task.spaceId);
        }
      } catch {
        // the tree catches up on the next refetch; don't leave the task dangling
      }
      setTimeout(() => {
        emit({ operation: "refetchRootTreeNodeEvent", spaceId: task.spaceId });
      }, 50);
    }
    files.current.delete(task.id);
  };

  const poll = async (id: string) => {
    if (!navigator.onLine) return markFailure(id);
    // A slow request must not overlap the next tick's request for the same task.
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    try {
      const task = await getFileTaskById(id);
      if (finished.current.has(id)) return;
      fails.current.delete(id);
      if (task.status === "processing") {
        renderProgress(task);
        return;
      }
      finished.current.add(id);
      setIds((prev) => prev.filter((x) => x !== id));
      await finish(task);
    } catch {
      markFailure(id);
    } finally {
      inFlight.current.delete(id);
    }
  };

  // Transient errors are retried every tick; after a few the toast says so.
  const markFailure = (id: string) => {
    const n = (fails.current.get(id) ?? 0) + 1;
    fails.current.set(id, n);
    const task = lastTask.current.get(id);
    if (n === LOST_AFTER_FAILS && task) renderProgress(task);
  };

  useEffect(() => {
    const listener: Listener = (task, file) => {
      if (file) files.current.set(task.id, file);
      addTask(task);
    };
    listeners.add(listener);
    getActiveEaImports()
      .then((tasks) => tasks.forEach(addTask))
      .catch(() => undefined);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (ids.length === 0) return;
    const timer = setInterval(() => ids.forEach(poll), POLL_MS);
    return () => clearInterval(timer);
  }, [ids]);

  return null;
}
