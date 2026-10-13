import {
  Modal,
  Button,
  SimpleGrid,
  FileButton,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconBrandNotion,
  IconCheck,
  IconFileCode,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileTypeXml,
  IconFileTypeZip,
  IconMarkdown,
  IconX,
} from "@tabler/icons-react";
import {
  importPage,
  importZip,
} from "@/features/page/services/page-service.ts";
import { importEaXml } from "@/ee/ea-import/services/ea-import-service.ts";
import { trackEaImport } from "@/ee/ea-import/ea-import-tracker.tsx";
import type { EaImportMode } from "@/ee/ea-import/services/ea-import-service.ts";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { useAtom } from "jotai";
import { buildTree } from "@/features/page/tree/utils";
import { IPage } from "@/features/page/types/page.types.ts";
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfluenceIcon } from "@/components/icons/confluence-icon.tsx";
import { getFileImportSizeLimit } from "@/lib/config.ts";
import { formatBytes } from "@/lib";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { useUpgradeLabel } from "@/ee/hooks/use-upgrade-label";
import { getFileTaskById } from "@/features/file-task/services/file-task-service.ts";
import { queryClient } from "@/main.tsx";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import { useRefreshSubPages } from "@/ee/import-subpage/use-refresh-sub-pages.ts";
import bytes from "bytes";

interface PageImportModalProps {
  spaceId: string;
  // When set, imported pages become children of this page.
  parentPageId?: string;
  open: boolean;
  onClose: () => void;
}

export default function PageImportModal({
  spaceId,
  parentPageId,
  open,
  onClose,
}: PageImportModalProps) {
  const { t } = useTranslation();
  return (
    <>
      <Modal.Root
        opened={open}
        onClose={onClose}
        size={600}
        padding="xl"
        yOffset="10vh"
        xOffset={0}
        mah={400}
        keepMounted={true}
      >
        <Modal.Overlay />
        <Modal.Content style={{ overflow: "hidden" }}>
          <Modal.Header py={0}>
            <Modal.Title fw={500}>{t("Import pages")}</Modal.Title>
            <Modal.CloseButton aria-label={t("Close")} />
          </Modal.Header>
          <Modal.Body>
            <ImportFormatSelection
              spaceId={spaceId}
              parentPageId={parentPageId}
              onClose={onClose}
            />
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}

interface ImportFormatSelection {
  spaceId: string;
  parentPageId?: string;
  onClose: () => void;
}
function ImportFormatSelection({
  spaceId,
  parentPageId,
  onClose,
}: ImportFormatSelection) {
  const { t } = useTranslation();
  const refreshSubPages = useRefreshSubPages();
  const [treeData, setTreeData] = useAtom(treeDataAtom);
  const [fileTaskId, setFileTaskId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const emit = useQueryEmit();

  const markdownFileRef = useRef<() => void>(null);
  const htmlFileRef = useRef<() => void>(null);
  const docxFileRef = useRef<() => void>(null);
  const pdfFileRef = useRef<() => void>(null);
  const notionFileRef = useRef<() => void>(null);
  const confluenceFileRef = useRef<() => void>(null);
  const zipFileRef = useRef<() => void>(null);
  const eaFileRef = useRef<() => void>(null);
  const pendingEaFileRef = useRef<File | null>(null);
  const handleEaUploadRef = useRef<
    ((file: File, mode?: EaImportMode) => Promise<void>) | null
  >(null);

  const canUseConfluence = useHasFeature(Feature.CONFLUENCE_IMPORT);
  const canUseDocx = useHasFeature(Feature.DOCX_IMPORT);
  const canUsePdf = useHasFeature(Feature.PDF_IMPORT);
  const canUseEa = useHasFeature(Feature.EA_IMPORT);
  const upgradeLabel = useUpgradeLabel();

  const handleZipUpload = async (selectedFile: File, source: string) => {
    if (!selectedFile) {
      return;
    }

    const maxSize = getFileImportSizeLimit();
    if (selectedFile.size > maxSize) {
      notifications.show({
        color: "red",
        message: t("File exceeds the {{limit}} import limit", {
          limit: formatBytes(maxSize),
        }),
      });
      return;
    }

    try {
      onClose();

      notifications.show({
        id: "import",
        title: t("Uploading import file"),
        message: t("Please don't close this tab."),
        loading: true,
        withCloseButton: false,
        autoClose: false,
      });

      const importTask = await importZip(
        selectedFile,
        spaceId,
        source,
        parentPageId,
      );
      notifications.update({
        id: "import",
        title: t("Importing pages"),
        message: t(
          "Page import is in progress. You can check back later if this takes longer.",
        ),
        loading: true,
        withCloseButton: true,
        autoClose: false,
      });

      setFileTaskId(importTask.id);

      // Reset file input after successful upload
      if (source === "notion" && notionFileRef.current) {
        notionFileRef.current();
      } else if (source === "confluence" && confluenceFileRef.current) {
        confluenceFileRef.current();
      } else if (source === "generic" && zipFileRef.current) {
        zipFileRef.current();
      }
    } catch (err) {
      console.error("Failed to upload import file", err);
      notifications.update({
        id: "import",
        color: "red",
        title: t("Failed to upload import file"),
        message: err?.response?.data?.message || t("Check your connection and try again."),
        icon: <IconX size={18} />,
        loading: false,
        withCloseButton: true,
        autoClose: false,
      });
    }
  };

  useEffect(() => {
    if (!fileTaskId) return;

    const intervalId = setInterval(async () => {
      try {
        const fileTask = await getFileTaskById(fileTaskId);
        const status = fileTask.status;

        if ((fileTask.metadata as any)?.duplicate === true) {
          clearInterval(intervalId);
          setFileTaskId(null);
          notifications.hide("import");
          const pendingFile = pendingEaFileRef.current;
          const run = (mode: EaImportMode) => {
            modals.closeAll();
            if (pendingFile) {
              void handleEaUploadRef.current?.(pendingFile, mode);
            }
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
                  <Button
                    variant="default"
                    onClick={() => run("keep")}
                  >
                    {t("Keep both")}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => modals.closeAll()}
                  >
                    {t("Skip")}
                  </Button>
                  <Button color="red" onClick={() => run("replace")}>
                    {t("Replace")}
                  </Button>
                </Stack>
              </Stack>
            ),
          });
          return;
        }

        if ((fileTask.metadata as any)?.skipped === true) {
          notifications.update({
            id: "import",
            color: "yellow",
            title: t("Import skipped"),
            message: t(
              "This Enterprise Architect package was already imported into this space.",
            ),
            loading: false,
            withCloseButton: true,
            autoClose: false,
          });
          clearInterval(intervalId);
          setFileTaskId(null);
          return;
        }

        if (status === "success") {
          notifications.update({
            id: "import",
            color: "teal",
            title: t("Import complete"),
            message: t("Your pages were successfully imported."),
            icon: <IconCheck size={18} />,
            loading: false,
            withCloseButton: true,
            autoClose: false,
          });
          clearInterval(intervalId);
          setFileTaskId(null);

          await queryClient.refetchQueries({
            queryKey: ["root-sidebar-pages", fileTask.spaceId],
          });

          await queryClient.invalidateQueries({
            queryKey: ["recent-changes", fileTask.spaceId],
          });

          if (parentPageId) await refreshSubPages(parentPageId, spaceId);

          setTimeout(() => {
            emit({
              operation: "refetchRootTreeNodeEvent",
              spaceId: spaceId,
            });
          }, 50);
        }

        if (status === "failed") {
          notifications.update({
            id: "import",
            color: "red",
            title: t("Page import failed"),
            message: t(
              "Something went wrong while importing pages: {{reason}}.",
              {
                reason: fileTask.errorMessage,
              },
            ),
            icon: <IconX size={18} />,
            loading: false,
            withCloseButton: true,
            autoClose: false,
          });
          clearInterval(intervalId);
          setFileTaskId(null);
          console.error(fileTask.errorMessage);
        }
      } catch (err) {
        notifications.update({
          id: "import",
          color: "red",
          title: t("Import failed"),
          message: t(
            "Something went wrong while importing pages: {{reason}}.",
            {
              reason: err?.response?.data?.message,
            },
          ),
          icon: <IconX size={18} />,
          loading: false,
          withCloseButton: true,
          autoClose: false,
        });
        clearInterval(intervalId);
        setFileTaskId(null);
        console.error("Failed to fetch import status", err);
      }
    }, 3000);
  }, [fileTaskId]);

  const maxSingleFileSize = bytes("30mb");

  const handleFileUpload = async (selectedFiles: File[]) => {
    if (!selectedFiles) {
      return;
    }

    const oversizedFiles = selectedFiles.filter(
      (f) => f.size > maxSingleFileSize,
    );
    if (oversizedFiles.length > 0) {
      notifications.show({
        color: "red",
        message: t("File exceeds the {{limit}} import limit", {
          limit: formatBytes(maxSingleFileSize),
        }),
      });
      return;
    }

    onClose();

    const alert = notifications.show({
      title: t("Importing pages"),
      message: t("Page import is in progress. Please do not close this tab."),
      loading: true,
      autoClose: false,
    });

    const pages: IPage[] = [];
    let pageCount = 0;

    for (const file of selectedFiles) {
      try {
        const page = await importPage(file, spaceId, parentPageId);
        pages.push(page);
        pageCount += 1;
      } catch (err) {
        console.error("Failed to import page", err);
      }
    }

    if (pages?.length > 0 && pageCount > 0) {
      const newTreeNodes = buildTree(pages);
      const fullTree = treeData.concat(newTreeNodes);

      if (parentPageId) {
        await refreshSubPages(parentPageId, spaceId);
      } else if (newTreeNodes?.length && fullTree?.length > 0) {
        setTreeData(fullTree);
      }

      // Reset file inputs after successful upload
      if (markdownFileRef.current) markdownFileRef.current();
      if (htmlFileRef.current) htmlFileRef.current();
      if (docxFileRef.current) docxFileRef.current();
      if (pdfFileRef.current) pdfFileRef.current();

      const pageCountText =
        pageCount === 1 ? `1 ${t("page")}` : `${pageCount} ${t("pages")}`;

      notifications.update({
        id: alert,
        color: "teal",
        title: `${t("Successfully imported")} ${pageCountText}`,
        message: t("Your import is complete."),
        icon: <IconCheck size={18} />,
        loading: false,
        autoClose: 5000,
      });
    } else {
      notifications.update({
        id: alert,
        color: "red",
        title: t("Failed to import pages"),
        message: t("Unable to import pages. Please try again."),
        icon: <IconX size={18} />,
        loading: false,
        autoClose: 5000,
      });
    }
  };

  const handleEaUpload = async (selectedFile: File, mode?: EaImportMode) => {
    if (!selectedFile) {
      return;
    }

    const maxEaFileSize = getFileImportSizeLimit();
    if (selectedFile.size > maxEaFileSize) {
      notifications.show({
        color: "red",
        message: t("File exceeds the {{limit}} import limit", {
          limit: formatBytes(maxEaFileSize),
        }),
      });
      return;
    }

    pendingEaFileRef.current = selectedFile;

    try {
      onClose();

      notifications.show({
        id: "import",
        title: t("Uploading import file"),
        message: t("Please don't close this tab."),
        loading: true,
        withCloseButton: false,
        autoClose: false,
      });

      const task = await importEaXml(selectedFile, spaceId, mode, parentPageId);

      notifications.hide("import");
      trackEaImport(task, selectedFile);

      eaFileRef.current?.();
    } catch (err) {
      console.error("Failed to upload EA XML file", err);
      notifications.update({
        id: "import",
        color: "red",
        title: t("Failed to upload import file"),
        message: err?.response?.data?.message,
        icon: <IconX size={18} />,
        loading: false,
        withCloseButton: true,
        autoClose: false,
      });
    }
  };
  handleEaUploadRef.current = handleEaUpload;

  const fileExt = (f: File) =>
    f.name.slice(f.name.lastIndexOf(".")).toLowerCase();

  const chooseZipSource = (file: File) => {
    const run = (source: string) => {
      modals.closeAll();
      if (source === "ea") void handleEaUpload(file);
      else void handleZipUpload(file, source);
    };
    modals.open({
      title: t("Select import source"),
      centered: true,
      children: (
        <Stack gap="xs">
          <Text size="sm" lineClamp={1}>
            {file.name}
          </Text>
          <Button variant="default" onClick={() => run("generic")}>
            {t("Markdown / HTML (ZIP)")}
          </Button>
          <Button variant="default" onClick={() => run("notion")}>
            Notion
          </Button>
          <Button
            variant="default"
            disabled={!canUseConfluence || !!parentPageId}
            onClick={() => run("confluence")}
          >
            Confluence
          </Button>
          <Button
            variant="default"
            disabled={!canUseEa}
            onClick={() => run("ea")}
          >
            Enterprise Architect
          </Button>
        </Stack>
      ),
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);

    const docs = files.filter(
      (f) =>
        [".md", ".html"].includes(fileExt(f)) ||
        (fileExt(f) === ".docx" && canUseDocx) ||
        (fileExt(f) === ".pdf" && canUsePdf),
    );
    const ea = files.find(
      (f) => [".xml", ".xmi"].includes(fileExt(f)) && canUseEa,
    );
    const zip = files.find((f) => fileExt(f) === ".zip");

    if (docs.length) void handleFileUpload(docs);
    else if (ea) void handleEaUpload(ea);
    else if (zip) chooseZipSource(zip);
    else {
      notifications.show({
        color: "red",
        message: t("Unsupported file type"),
      });
    }
  };

  // @ts-ignore
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDragging(false);
        }
      }}
      onDrop={handleDrop}
      style={{
        outline: dragging
          ? "2px dashed var(--mantine-color-blue-6)"
          : "2px dashed transparent",
        outlineOffset: 8,
        borderRadius: 8,
      }}
    >
      <SimpleGrid cols={2}>
        <FileButton
          onChange={handleFileUpload}
          accept=".md"
          multiple
          resetRef={markdownFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Markdown" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconMarkdown size={18} />}
              {...props}
            >
              Markdown
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={handleFileUpload}
          accept="text/html"
          multiple
          resetRef={htmlFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "HTML" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconFileCode size={18} />}
              {...props}
            >
              HTML
            </Button>
          )}
        </FileButton>

        <FileButton
          onChange={handleFileUpload}
          accept=".docx"
          multiple
          resetRef={docxFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Word (DOCX)" }),
          }}
        >
          {(props) => (
            <Tooltip
              label={upgradeLabel}
              disabled={canUseDocx}
            >
              <Button
                disabled={!canUseDocx}
                justify="start"
                variant="default"
                leftSection={<IconFileTypeDocx size={18} />}
                {...props}
              >
                Word (DOCX)
              </Button>
            </Tooltip>
          )}
        </FileButton>

        <FileButton
          onChange={handleFileUpload}
          accept=".pdf"
          multiple
          resetRef={pdfFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "PDF" }),
          }}
        >
          {(props) => (
            <Tooltip
              label={upgradeLabel}
              disabled={canUsePdf}
            >
              <Button
                disabled={!canUsePdf}
                justify="start"
                variant="default"
                leftSection={<IconFileTypePdf size={18} />}
                {...props}
              >
                PDF
              </Button>
            </Tooltip>
          )}
        </FileButton>

        <FileButton
          onChange={handleEaUpload}
          accept=".xml,.xmi,.zip"
          resetRef={eaFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", {
              format: "Enterprise Architect (XML/XMI or ZIP with Images)",
            }),
          }}
        >
          {(props) => (
            <Tooltip label={upgradeLabel} disabled={canUseEa}>
              <Button
                disabled={!canUseEa}
                justify="start"
                variant="default"
                leftSection={<IconFileTypeXml size={18} />}
                {...props}
              >
                Enterprise Architect (XML)
              </Button>
            </Tooltip>
          )}
        </FileButton>

        <FileButton
          onChange={(file) => handleZipUpload(file, "notion")}
          accept="application/zip"
          resetRef={notionFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Notion" }),
          }}
        >
          {(props) => (
            <Button
              justify="start"
              variant="default"
              leftSection={<IconBrandNotion size={18} />}
              {...props}
            >
              Notion
            </Button>
          )}
        </FileButton>
        <FileButton
          onChange={(file) => handleZipUpload(file, "confluence")}
          accept="application/zip"
          resetRef={confluenceFileRef}
          inputProps={{
            "aria-label": t("Choose {{format}} file", { format: "Confluence" }),
          }}
        >
          {(props) => (
            <Tooltip
              label={upgradeLabel}
              disabled={canUseConfluence}
            >
              <Button
                disabled={!canUseConfluence || !!parentPageId}
                justify="start"
                variant="default"
                leftSection={<ConfluenceIcon size={18} />}
                {...props}
              >
                Confluence
              </Button>
            </Tooltip>
          )}
        </FileButton>
      </SimpleGrid>

      <Group justify="center" gap="xl" mih={150}>
        <div>
          <Text ta="center" size="lg" inline>
            Import zip file
          </Text>
          <Text ta="center" size="xs" c="dimmed" inline>
            {t("or drag & drop files here")}
          </Text>
          <Text ta="center" size="sm" c="dimmed" inline py="sm">
            {t(
              `Upload zip file containing Markdown and HTML files. Max: {{sizeLimit}}`,
              {
                sizeLimit: formatBytes(getFileImportSizeLimit()),
              },
            )}
          </Text>
          <FileButton
            onChange={(file) => handleZipUpload(file, "generic")}
            accept="application/zip"
            resetRef={zipFileRef}
            inputProps={{
              "aria-label": t("Choose {{format}} file", { format: "ZIP" }),
            }}
          >
            {(props) => (
              <Group justify="center">
                <Button
                  justify="center"
                  leftSection={<IconFileTypeZip size={18} />}
                  {...props}
                >
                  {t("Upload file")}
                </Button>
              </Group>
            )}
          </FileButton>
        </div>
      </Group>
    </div>
  );
}
