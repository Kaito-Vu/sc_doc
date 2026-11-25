import { useEffect, useState } from "react";
import {
  Button,
  Group,
  NumberInput,
  Stack,
  TagsInput,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";
import {
  useAttachmentSettingsQuery,
  useUpdateAttachmentSettingsMutation,
} from "@/ee/attachment-settings/queries/attachment-settings-query";

const MB = 1024 * 1024;

export default function AttachmentSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const { data } = useAttachmentSettingsQuery();
  const mutation = useUpdateAttachmentSettingsMutation();

  const [uploadMb, setUploadMb] = useState<number | string>("");
  const [rtfMb, setRtfMb] = useState<number | string>("");
  const [extensions, setExtensions] = useState<string[]>([]);
  const [mimeTypes, setMimeTypes] = useState<string[]>([]);

  useEffect(() => {
    if (!data) return;
    setUploadMb(data.maxUploadBytes / MB);
    setRtfMb(data.maxTotalRtfBytes / MB);
    setExtensions(data.allowedExtensions);
    setMimeTypes(data.allowedMimeTypes);
  }, [data]);

  if (!isAdmin) return null;

  const valid = Number(uploadMb) > 0 && Number(rtfMb) > 0;

  const save = () =>
    mutation.mutate({
      maxUploadBytes: Math.round(Number(uploadMb) * MB),
      maxTotalRtfBytes: Math.round(Number(rtfMb) * MB),
      allowedExtensions: extensions,
      allowedMimeTypes: mimeTypes,
    });

  const reset = () =>
    mutation.mutate({
      maxUploadBytes: null,
      maxTotalRtfBytes: null,
      allowedExtensions: null,
      allowedMimeTypes: null,
    });

  return (
    <>
      <DocumentTitle title={t("Attachments")} />
      <SettingsTitle title={t("Attachments")} />

      <Stack gap="md" maw={640}>
        <NumberInput
          label={t("Maximum upload size (MB)")}
          description={t("Largest file a member can upload to a page.")}
          min={1}
          allowDecimal={false}
          value={uploadMb}
          onChange={(v) => setUploadMb(v as number | string)}
        />

        <TagsInput
          label={t("Allowed file extensions")}
          description={t(
            "For example .pdf, .docx. Leave empty to allow every extension.",
          )}
          value={extensions}
          onChange={setExtensions}
        />

        <TagsInput
          label={t("Allowed MIME types")}
          description={t(
            "For example image/*, application/pdf. Leave empty to skip the MIME check.",
          )}
          value={mimeTypes}
          onChange={setMimeTypes}
        />

        <NumberInput
          label={t("Maximum total RTF size for EA import (MB)")}
          description={t(
            "Combined size of all model documents converted in one EA import. Documents beyond this are skipped.",
          )}
          min={1}
          allowDecimal={false}
          value={rtfMb}
          onChange={(v) => setRtfMb(v as number | string)}
        />

        <Text size="xs" c="dimmed">
          {t(
            "Limits apply to new uploads only. Files already uploaded are not affected.",
          )}
        </Text>

        <Group>
          <Button onClick={save} disabled={!valid} loading={mutation.isPending}>
            {t("Save")}
          </Button>
          <Button
            variant="default"
            onClick={reset}
            disabled={mutation.isPending}
          >
            {t("Reset to default")}
          </Button>
        </Group>
      </Stack>
    </>
  );
}
