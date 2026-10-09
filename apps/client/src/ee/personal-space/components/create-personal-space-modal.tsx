import { Modal, Text, Button, Group, Divider } from "@mantine/core";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCreatePersonalSpaceMutation } from "@/ee/personal-space/queries/personal-space-query";
import { getSpaceUrl } from "@/lib/config.ts";
import { notifications } from "@mantine/notifications";

type Props = {
  opened: boolean;
  onClose: () => void;
};

export default function CreatePersonalSpaceModal({ opened, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createMutation = useCreatePersonalSpaceMutation();

  const handleConfirm = async () => {
    try {
      const createdSpace = await createMutation.mutateAsync();
      onClose();
      navigate(getSpaceUrl(createdSpace.slug));
    } catch (err) {
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Create personal space")}
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      <Divider size="xs" mb="md" />
      <Text size="sm">
        {t('This will create your personal space, named "Personal Space".')}
      </Text>
      <Group justify="flex-end" mt="md">
        <Button variant="default" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button onClick={handleConfirm} loading={createMutation.isPending}>
          {t("Create")}
        </Button>
      </Group>
    </Modal>
  );
}
