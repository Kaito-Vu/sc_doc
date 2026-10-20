import React, { Suspense, useState } from "react";
import {
  Button,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconPlus, IconTemplate } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DestinationPicker } from "@/components/ui/destination-picker/destination-picker";
import type { DestinationSelection } from "@/components/ui/destination-picker/destination-picker.types";
import { useCreatePageMutation } from "@/features/page/queries/page-query";
import { buildPageUrl } from "@/features/page/page.utils";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { quickCreateOpenedAtom } from "./atoms";

const TemplatePickerModal = React.lazy(
  () => import("@/ee/template/components/template-picker-modal"),
);

export function QuickCreateModal() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opened, setOpened] = useAtom(quickCreateOpenedAtom);
  const [selection, setSelection] = useState<DestinationSelection | null>(null);
  const createMutation = useCreatePageMutation();
  const hasTemplates = useHasFeature(Feature.TEMPLATES);
  const [templateOpened, templateHandlers] = useDisclosure(false);

  const close = () => {
    setOpened(false);
    setSelection(null);
  };

  const handleCreate = async () => {
    if (!selection) return;

    const spaceSlug = selection.space?.slug;
    const page = await createMutation.mutateAsync({
      spaceId: selection.spaceId,
      parentPageId:
        selection.type === "page" ? selection.pageId : undefined,
    } as any);

    const slug = spaceSlug ?? page.space?.slug;
    if (slug && page.slugId) {
      navigate(buildPageUrl(slug, page.slugId, page.title));
    }
    close();
  };

  const handleUseTemplate = () => {
    if (!selection) return;
    templateHandlers.open();
    setOpened(false);
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={close}
        title={t("Create document")}
        size="lg"
        centered
        trapFocus
        returnFocus
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t(
              "Choose a space or an existing page. The new document becomes a child of the selected page.",
            )}
          </Text>

          <DestinationPicker
            onSelectionChange={setSelection}
            initialSpaceId={selection?.spaceId}
          />

          <Divider />

          <Group justify="space-between" wrap="wrap">
            <Text size="sm" c="dimmed">
              {selection
                ? selection.type === "space"
                  ? t("New page in {{name}}", {
                      name: selection.space?.name ?? "",
                    })
                  : t("New child page under {{title}}", {
                      title:
                        selection.page?.title || t("Untitled"),
                    })
                : t("Select a destination to continue.")}
            </Text>

            <Group gap="xs">
              <Button variant="default" onClick={close}>
                {t("Cancel")}
              </Button>
              {hasTemplates && (
                <Button
                  variant="light"
                  leftSection={<IconTemplate size={16} />}
                  onClick={handleUseTemplate}
                  disabled={!selection}
                >
                  {t("Use template")}
                </Button>
              )}
              <Button
                leftSection={<IconPlus size={16} />}
                onClick={handleCreate}
                loading={createMutation.isPending}
                disabled={!selection}
              >
                {t("Create page")}
              </Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      {templateOpened && selection && (
        <Suspense fallback={null}>
          <TemplatePickerModal
            opened={templateOpened}
            onClose={() => {
              templateHandlers.close();
              setSelection(null);
            }}
            initialSpaceId={selection.spaceId}
            initialParentPageId={
              selection.type === "page" ? selection.pageId : undefined
            }
          />
        </Suspense>
      )}
    </>
  );
}
