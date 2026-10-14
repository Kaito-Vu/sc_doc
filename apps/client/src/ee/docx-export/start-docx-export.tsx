import { Anchor, Group, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDownload } from "@tabler/icons-react";
import i18n from "@/i18n.ts";
import api from "@/lib/api-client.ts";

interface Params {
  pageId: string;
  includeChildren?: boolean;
  singleFile?: boolean;
  toc?: boolean;
  order?: string[];
}

type Status =
  | { state: "queued" | "active" | "expired" }
  | { state: "failed"; message?: string }
  | { state: "done"; token: string; fileName: string; expiresAt: number };

const POLL_MS = 2000;
const GIVE_UP_MS = 30 * 60 * 1000;

/**
 * Queues the export on the server, then follows it with a persistent toast:
 * progress while it runs, a download link (valid until `expiresAt`) when done.
 */
export async function startDocxExport(params: Params): Promise<void> {
  const t = i18n.t.bind(i18n);
  // "/api/docx-export" is on api-client's raw-response list, so the body still
  // carries the server's { data } envelope here (other routes are unwrapped).
  const res: any = await api.post("/docx-export", {
    ...params,
    tocTitle: t("Table of contents"),
  });
  const jobId: string = res.data?.data?.jobId ?? res.data?.jobId;
  const id = `docx-export-${jobId}`;

  notifications.show({
    id,
    loading: true,
    autoClose: false,
    withCloseButton: false,
    title: t("Export queued"),
    message: t("We'll show a download link here when your file is ready."),
  });

  const fail = (message: string) =>
    notifications.update({
      id,
      loading: false,
      color: "red",
      autoClose: false,
      withCloseButton: true,
      title: t("Export failed"),
      message,
    });

  const started = Date.now();
  const timer = setInterval(async () => {
    try {
      if (Date.now() - started > GIVE_UP_MS) {
        clearInterval(timer);
        return fail(t("Export timed out"));
      }
      const { data: s } = await api.get<Status>(
        `/docx-export/status/${jobId}`,
      );
      if (s.state === "done") {
        clearInterval(timer);
        const minutes = Math.max(
          1,
          Math.round((s.expiresAt - Date.now()) / 60000),
        );
        notifications.update({
          id,
          loading: false,
          color: "green",
          autoClose: false,
          withCloseButton: true,
          title: t("Export ready"),
          message: (
            <>
              <Group gap={6} wrap="nowrap">
                <IconDownload size={16} />
                <Anchor
                  href={`/api/docx-export/download/${s.token}`}
                  download={s.fileName}
                  size="sm"
                >
                  {s.fileName}
                </Anchor>
              </Group>
              <Text size="xs" c="dimmed" mt={4}>
                {t("The link expires in {{minutes}} minutes.", { minutes })}
              </Text>
            </>
          ),
        });
      } else if (s.state === "failed") {
        clearInterval(timer);
        fail(s.message || t("Export failed"));
      } else if (s.state === "expired") {
        clearInterval(timer);
        fail(t("The download link has expired"));
      } else {
        notifications.update({
          id,
          loading: true,
          autoClose: false,
          withCloseButton: false,
          title: s.state === "active" ? t("Exporting…") : t("Export queued"),
          message: t("We'll show a download link here when your file is ready."),
        });
      }
    } catch (err) {
      clearInterval(timer);
      fail(err?.response?.data?.message ?? t("Export failed"));
    }
  }, POLL_MS);
}
