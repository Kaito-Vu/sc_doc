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
import {
  cancelEaImport,
  EaImportMode,
  getActiveEaImports,
  importEaXml,
} from "@/ee/ea-import/services/ea-import-service.ts";

const POLL_MS = 2000;
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
  const [ids, setIds] = useState<string[]>([]);
  const files = useRef(new Map<string, File>());
  const shown = useRef(new Set<string>());
  const finished = useRef(new Set<string>());

  const notifId = (task: IFileTask) => `ea-import-${task.id}`;

  const renderProgress = (task: IFileTask) => {
    const progress = (task.metadata as any)?.progress as number | undefined;
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
          <Progress value={progress ?? 0} size="sm" animated />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {progress === undefined ? t("Queued…") : `${progress}%`}
            </Text>
            {(progress ?? 0) < POINT_OF_NO_RETURN && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => cancelEaImport(task.id).catch(() => undefined)}
              >
                {t("Cancel")}
              </Button>
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
      importEaXml(file, task.spaceId, mode)
        .then((next) => {
          files.current.set(next.id, file);
          addTask(next);
        })
        .catch((err) =>
          notifications.show({
            color: "red",
            title: t("Failed to upload import file"),
            message: err?.response?.data?.message,
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
            <Button variant="default" onClick={() => run("keep")}>
              {t("Keep both")}
            </Button>
            <Button variant="default" onClick={() => modals.closeAll()}>
              {t("Skip")}
            </Button>
            <Button color="red" onClick={() => run("replace")}>
              {t("Replace")}
            </Button>
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
          reason: task.errorMessage,
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
        message: t("Your pages were successfully imported."),
        icon: <IconCheck size={18} />,
        autoClose: false,
      });
      await queryClient.refetchQueries({
        queryKey: ["root-sidebar-pages", task.spaceId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["recent-changes", task.spaceId],
      });
      setTimeout(() => {
        emit({ operation: "refetchRootTreeNodeEvent", spaceId: task.spaceId });
      }, 50);
    }
    files.current.delete(task.id);
  };

  const poll = async (id: string) => {
    try {
      const task = await getFileTaskById(id);
      if (finished.current.has(id)) return;
      if (task.status === "processing") {
        renderProgress(task);
        return;
      }
      finished.current.add(id);
      setIds((prev) => prev.filter((x) => x !== id));
      await finish(task);
    } catch {
      // transient error: try again on the next tick
    }
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
