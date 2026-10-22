import { Modal } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useUpdateApiKeyMutation } from "@/ee/api-key/queries/api-key-query";
import { IApiKey } from "@/ee/api-key";
import { RenameCredentialForm } from "@/ee/components/rename-credential-form";

interface UpdateApiKeyModalProps {
  opened: boolean;
  onClose: () => void;
  apiKey: IApiKey | null;
}

export function UpdateApiKeyModal({
  opened,
  onClose,
  apiKey,
}: UpdateApiKeyModalProps) {
  const { t } = useTranslation();
  const updateApiKeyMutation = useUpdateApiKeyMutation();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Update {{credential}}", { credential: t("API key") })}
      size="md"
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      <RenameCredentialForm
        opened={opened}
        currentName={apiKey?.name}
        placeholder={t("Enter a descriptive token name")}
        loading={updateApiKeyMutation.isPending}
        onClose={onClose}
        onSubmit={(name) =>
          apiKey &&
          updateApiKeyMutation.mutateAsync({ apiKeyId: apiKey.id, name })
        }
      />
    </Modal>
  );
}
