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

const SEEN_KEY = "ea-import-seen";

// Finished tasks are re-listed for a while after a reload; show each outcome once.
function wasSeen(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]).includes(id);
  } catch {
    return false;
  }
}

function markSeen(id: string) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id].slice(-50)));
  } catch {
    // storage unavailable: worst case the outcome shows again after a reload
  }
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const sec = String(total % 60).padStart(2, "0");
  return m >= 60
    ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${sec}`
    : `${m}:${sec}`;
}

type Listener =(task: IFileTask, file?: File) => void;
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
  const nextAt = useRef(new Map<string, number>());

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
          // The import may have finished before the cancel landed: don't contradict its outcome.
          if (finished.current.has(task.id)) return;
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

  // SLA: elapsed time since the task was created and an ETA extrapolated from progress.
  const sla = (task: IFileTask, progress: number) => {
    const elapsed = Math.max(0, Date.now() - new Date(task.createdAt).getTime());
    if (!Number.isFinite(elapsed)) return "";
    const eta =
      progress >= 5 && progress < 100
        ? ` · ${t("about {{time}} left", { time: formatDuration((elapsed / progress) * (100 - progress)) })}`
        : "";
    return ` · ${t("Elapsed {{time}}", { time: formatDuration(elapsed) })}${eta}`;
  };

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
          : `${progress}%${sla(task, progress)}`;
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
            animated={!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches}
            aria-label={t("Importing pages")}
            aria-valuetext={statusText}
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
                aria-label={`${t("Cancel import")}: ${task.fileName}`}
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

  const showSkipped = (task: IFileTask) =>
    notifications.show({
      id: `${notifId(task)}-skipped`,
      color: "yellow",
      title: t("Import skipped"),
      message: t(
        "This Enterprise Architect package was already imported into this space.",
      ),
      autoClose: false,
    });

  const askDuplicate = (task: IFileTask, file: File) => {
    let chosen = false;
    const modalId = `ea-duplicate-${task.id}`;
    const run = (mode: EaImportMode) => {
      // The modal animates out, so buttons stay clickable briefly: never upload twice.
      if (chosen) return;
      chosen = true;
      modals.close(modalId);
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
      modalId,
      // Dismissing (Esc, click away, Skip) must not look like a silent success.
      onClose: () => {
        if (!chosen) showSkipped(task);
      },
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
            <Button variant="default" onClick={() => modals.close(modalId)}>
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

  const showWarnings = (
    task: IFileTask,
    warnings: Array<{ page?: string; reason: string }>,
  ) =>
    modals.open({
      title: t("Import warnings"),
      centered: true,
      size: "lg",
      children: (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            {task.fileName} · {task.id}
          </Text>
          <Stack gap={4} mah={400} style={{ overflowY: "auto" }}>
            {warnings.map((w, i) => (
              <Text key={i} size="sm">
                {w.page ? `${w.page}: ` : ""}
                {w.reason}
              </Text>
            ))}
          </Stack>
        </Stack>
      ),
    });

  const finish = async (task: IFileTask) => {
    const id = notifId(task);
    const done = { id, loading: false, withCloseButton: true };
    const meta = task.metadata as any;
    const warnings: Array<{ page?: string; reason: string }> =
      Array.isArray(meta?.warnings) ? meta.warnings : [];
    const pageCount = Number(meta?.pageCount ?? 0);
    markSeen(task.id);

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
        message: (
          <Text size="sm" role="alert">
            {t("Something went wrong while importing pages: {{reason}}.", {
              reason: task.errorMessage || t("unknown error"),
            })}
          </Text>
        ),
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
        notifications.hide(id);
        showSkipped(task);
      }
    } else {
      const empty = pageCount === 0;
      const warned = warnings.length > 0;
      const summary = meta?.merge
        ? (t(
            "{{added}} added, {{filled}} filled, {{kept}} unchanged, {{skipped}} skipped (already had content).",
            { ...meta.merge },
          ) as string)
        : empty
          ? t("No pages were created.")
          : t("Your pages were successfully imported.");
      notifications.update({
        ...done,
        color: empty || warned ? "yellow" : "teal",
        title: empty
          ? t("Import finished without pages")
          : warned
            ? t("Import completed with warnings")
            : t("Import complete"),
        message: warned ? (
          <Stack gap={6}>
            <Text size="sm">{summary}</Text>
            <Text size="xs" c="dimmed">
              {t("{{count}} warning(s)", { count: warnings.length })}
            </Text>
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => showWarnings(task, warnings)}
            >
              {t("View details")}
            </Button>
          </Stack>
        ) : (
          summary
        ),
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
    // Keep `shown`/`finished` (they stop a late poll re-showing the toast); drop the rest.
    lastTask.current.delete(task.id);
    fails.current.delete(task.id);
    nextAt.current.delete(task.id);
    canceling.current.delete(task.id);
  };

  const poll = async (id: string) => {
    if (Date.now() < (nextAt.current.get(id) ?? 0)) return;
    if (!navigator.onLine) return markFailure(id);
    // A slow request must not overlap the next tick's request for the same task.
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    try {
      const task = await getFileTaskById(id);
      // A proxy can answer 200 with a non-task body: treat it as transient, keep polling.
      if (!task?.id || typeof task.status !== "string") {
        throw new Error("Unexpected task response");
      }
      if (finished.current.has(id)) return;
      fails.current.delete(id);
      nextAt.current.delete(id);
      if (task.status === "processing") {
        renderProgress(task);
        return;
      }
      finished.current.add(id);
      setIds((prev) => prev.filter((x) => x !== id));
      await finish(task);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403 || status === 404) {
        // The task is gone or not ours: stop polling instead of retrying forever.
        finished.current.add(id);
        setIds((prev) => prev.filter((x) => x !== id));
        notifications.hide(`ea-import-${id}`);
      } else {
        markFailure(id);
      }
    } finally {
      inFlight.current.delete(id);
    }
  };

  // Transient errors are retried every tick; after a few the toast says so.
  const markFailure = (id: string) => {
    const n = (fails.current.get(id) ?? 0) + 1;
    fails.current.set(id, n);
    // Back off (1s, 2s, 4s … max 30s) so a 429 isn't answered with more requests.
    nextAt.current.set(id, Date.now() + Math.min(30000, 1000 * 2 ** n));
    const task = lastTask.current.get(id);
    if (n === LOST_AFTER_FAILS && task) renderProgress(task);
  };

  useEffect(() => {
    const listener: Listener = (task, file) => {
      if (file) files.current.set(task.id, file);
      addTask(task);
    };
    listeners.add(listener);
    let alive = true;
    // Retry a couple of times: a 429/network blip right after F5 must not hide a running import.
    const discover = (attempt: number) =>
      getActiveEaImports()
        .then((tasks) => {
          if (!alive || !Array.isArray(tasks)) return;
          tasks.filter((task) => !wasSeen(task.id)).forEach(addTask);
        })
        .catch(() => {
          if (alive && attempt < 3) setTimeout(() => discover(attempt + 1), 3000 * attempt);
        });
    discover(1);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  // Leaving the tab (refresh/close) while an import runs: ask for confirmation.
  useEffect(() => {
    if (ids.length === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [ids.length > 0]);

  useEffect(() => {
    if (ids.length === 0) return;
    const timer = setInterval(() => ids.forEach(poll), POLL_MS);
    return () => clearInterval(timer);
  }, [ids]);

  return null;
}
