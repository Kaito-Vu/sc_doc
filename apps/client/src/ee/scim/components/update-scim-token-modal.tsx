import { Modal } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useUpdateScimTokenMutation } from "@/ee/scim/queries/scim-token-query";
import { IScimToken } from "@/ee/scim/types/scim-token.types";
import { RenameCredentialForm } from "@/ee/components/rename-credential-form";

interface UpdateScimTokenModalProps {
  opened: boolean;
  onClose: () => void;
  scimToken: IScimToken | null;
}

export function UpdateScimTokenModal({
  opened,
  onClose,
  scimToken,
}: UpdateScimTokenModalProps) {
  const { t } = useTranslation();
  const updateMutation = useUpdateScimTokenMutation();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Update {{credential}}", { credential: t("SCIM token") })}
      size="md"
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      <RenameCredentialForm
        opened={opened}
        currentName={scimToken?.name}
        placeholder={t("Enter a descriptive name")}
        loading={updateMutation.isPending}
        onClose={onClose}
        onSubmit={(name) => {
          if (!scimToken) return;
          return updateMutation.mutateAsync({ tokenId: scimToken.id, name });
        }}
      />
    </Modal>
  );
}
