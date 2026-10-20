import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  activateLicense,
  removeLicense,
  getLicenseInfo,
} from "@/ee/licence/services/license-service.ts";
import { ILicenseInfo } from "@/ee/licence/types/license.types.ts";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { notifyError } from "../../lib/notify-error";

export function useLicenseInfo(): UseQueryResult<ILicenseInfo, Error> {
  return useQuery({
    queryKey: ["license"],
    queryFn: () => getLicenseInfo(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useActivateMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation<ILicenseInfo, Error, string>({
    mutationFn: (licenseKey) => activateLicense(licenseKey),
    onSuccess: () => {
      notifications.show({ message: "License activated successfully" });
      queryClient.refetchQueries({
        queryKey: ["license"],
      });
      queryClient.refetchQueries({ queryKey: ["currentUser"] });
      queryClient.refetchQueries({ queryKey: ["entitlements"] });
    },
    onError: (error) => notifyError(error, t("Failed to activate license")),
  });
}

export function useRemoveLicenseMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => removeLicense(),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["license"] });
      queryClient.refetchQueries({ queryKey: ["currentUser"] });
      queryClient.refetchQueries({ queryKey: ["entitlements"] });
    },
  });
}
