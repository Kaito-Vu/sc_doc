import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  getAttachmentSettings,
  IUpdateAttachmentSettings,
  updateAttachmentSettings,
} from "@/ee/attachment-settings/services/attachment-settings-service";

const KEY = ["attachment-settings"];

export function useAttachmentSettingsQuery() {
  return useQuery({ queryKey: KEY, queryFn: getAttachmentSettings });
}

export function useUpdateAttachmentSettingsMutation() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [workspace, setWorkspace] = useAtom(workspaceAtom);

  return useMutation({
    mutationFn: (data: IUpdateAttachmentSettings) =>
      updateAttachmentSettings(data),
    onSuccess: (settings) => {
      queryClient.setQueryData(KEY, settings);
      // keep the client-side upload limit in step with what was saved
      if (workspace) {
        setWorkspace({
          ...workspace,
          settings: { ...workspace.settings, attachments: settings },
        });
      }
      notifications.show({ message: t("Updated successfully") });
    },
    onError: (error) => {
      notifications.show({
        message: getApiErrorMessage(error),
        color: "red",
      });
    },
  });
}
