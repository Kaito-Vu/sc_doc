import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import {
  approveAccessRequest,
  cancelAccessRequest,
  countAccessRequests,
  createAccessRequest,
  getAccessInfo,
  listAccessRequests,
  rejectAccessRequest,
} from "@/ee/space-access-request/services/space-access-request-service";

const KEY = "space-access-requests";

export function useAccessInfoQuery(spaceSlug: string | undefined) {
  return useQuery({
    queryKey: [KEY, "info", spaceSlug],
    queryFn: () => getAccessInfo(spaceSlug!),
    enabled: !!spaceSlug,
    staleTime: 0,
  });
}

export function useCreateAccessRequestMutation(spaceSlug: string | undefined) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: createAccessRequest,
    onSuccess: () => {
      notifications.show({ message: t("Access request sent") });
      qc.invalidateQueries({ queryKey: [KEY, "info", spaceSlug] });
    },
    onError: (err: any) =>
      notifications.show({
        message: err?.response?.data?.message ?? t("Failed to send request"),
        color: "red",
      }),
  });
}

export function useCancelAccessRequestMutation(spaceSlug: string | undefined) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: cancelAccessRequest,
    onSuccess: () => {
      notifications.show({ message: t("Request withdrawn") });
      qc.invalidateQueries({ queryKey: [KEY, "info", spaceSlug] });
    },
  });
}

export function useAccessRequestListQuery() {
  return useQuery({
    queryKey: [KEY, "list"],
    queryFn: () => listAccessRequests(),
  });
}

export function useAccessRequestCountQuery() {
  return useQuery({
    queryKey: [KEY, "count"],
    queryFn: countAccessRequests,
    // 403/empty for non-approvers is fine: the nav link hides itself on 0.
    retry: false,
    staleTime: 30_000,
  });
}

function useDecision<TVars>(fn: (v: TVars) => Promise<void>) {
  const qc = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY, "list"] });
      qc.invalidateQueries({ queryKey: [KEY, "count"] });
    },
    onError: (err: any) => {
      // 409 = another approver (or a withdrawal) got there first
      const handled = err?.response?.status === 409;
      notifications.show({
        message: handled
          ? t("This request was already handled")
          : (err?.response?.data?.message ?? t("Something went wrong")),
        color: handled ? "yellow" : "red",
      });
      qc.invalidateQueries({ queryKey: [KEY, "list"] });
      qc.invalidateQueries({ queryKey: [KEY, "count"] });
    },
  });
}

export const useApproveAccessRequestMutation = () =>
  useDecision(({ id, role }: { id: string; role: Parameters<typeof approveAccessRequest>[1] }) =>
    approveAccessRequest(id, role),
  );

export const useRejectAccessRequestMutation = () =>
  useDecision(({ id, reason }: { id: string; reason?: string }) =>
    rejectAccessRequest(id, reason),
  );
