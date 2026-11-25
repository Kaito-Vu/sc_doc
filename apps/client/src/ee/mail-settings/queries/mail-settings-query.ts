import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { getApiErrorMessage } from "@/lib/api-error";
import {
  getMailSettings,
  resetMailSettings,
  sendTestMail,
  updateMailSettings,
} from "@/ee/mail-settings/services/mail-settings-service";

const KEY = ["mail-settings"];

export function useMailSettingsQuery() {
  return useQuery({ queryKey: KEY, queryFn: getMailSettings });
}

function useMailMutation<TVars>(fn: (v: TVars) => Promise<any>, okMessage: string) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (settings) => {
      if (settings) queryClient.setQueryData(KEY, settings);
      notifications.show({ message: t(okMessage) });
    },
    onError: (error) =>
      notifications.show({ message: getApiErrorMessage(error), color: "red" }),
  });
}

export const useUpdateMailSettingsMutation = () =>
  useMailMutation(updateMailSettings, "Updated successfully");
export const useResetMailSettingsMutation = () =>
  useMailMutation(resetMailSettings, "Updated successfully");
export const useSendTestMailMutation = () =>
  useMailMutation(sendTestMail, "Test email sent");
