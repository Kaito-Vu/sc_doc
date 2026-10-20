import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { useTranslation } from "react-i18next";
import {
  useRemoveVerificationMutation,
  useUpdateVerificationMutation,
} from "@/ee/page-verification/queries/page-verification-query";
import { IPageVerificationInfo } from "@/ee/page-verification/types/page-verification.types";

export function useVerifierActions(
  info: IPageVerificationInfo,
  pageId: string,
  onClose: () => void,
) {
  const { t } = useTranslation();
  const removeMutation = useRemoveVerificationMutation();
  const updateMutation = useUpdateVerificationMutation();

  const handleRemove = () => {
    modals.openConfirmModal({
      title: t("Remove verification"),
      children: (
        <Text size="sm">
          {t("Are you sure you want to remove verification from this page?")}
        </Text>
      ),
      labels: { confirm: t("Remove"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => removeMutation.mutate(pageId, { onSuccess: onClose }),
    });
  };

  const handleRemoveVerifier = (userId: string) => {
    if (!info.verifiers) return;
    const remaining = info.verifiers
      .filter((v) => v.id !== userId)
      .map((v) => v.id);
    updateMutation.mutate({ pageId, verifierIds: remaining });
  };

  const handleAddVerifier = (userId: string) => {
    if (!info.verifiers) return;
    if (info.verifiers.some((v) => v.id === userId)) return;
    const verifierIds = [...info.verifiers.map((v) => v.id), userId];
    updateMutation.mutate({ pageId, verifierIds });
  };

  return {
    removeMutation,
    updateMutation,
    handleRemove,
    handleRemoveVerifier,
    handleAddVerifier,
  };
}
