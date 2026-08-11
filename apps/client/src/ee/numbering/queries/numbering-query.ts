import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateNumberingSettings } from "@/ee/numbering/services/numbering-service";
import {
  IUpdateNumberingSettings,
  IUpdateNumberingSettingsResponse,
} from "@/ee/numbering/types/numbering.types";
import { IPage } from "@/features/page/types/page.types";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";

export function useUpdateNumberingSettingsMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<
    IUpdateNumberingSettingsResponse,
    Error,
    IUpdateNumberingSettings
  >({
    mutationFn: (data) => updateNumberingSettings(data),
    onSuccess: (data, variables) => {
      queryClient.setQueriesData<IPage>({ queryKey: ["pages"] }, (old) => {
        if (old?.id === variables.pageId) {
          return { ...old, numberingSettings: data.numberingSettings };
        }
        return old;
      });
    },
    onError: (error) => {
      const errorMessage = error["response"]?.data?.message;
      notifications.show({
        message: errorMessage || t("Failed to update numbering settings"),
        color: "red",
      });
    },
  });
}
