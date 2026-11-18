import { Modal, Text, Button, Group, Stack, ThemeIcon } from "@mantine/core";
import { IconUser } from "@tabler/icons-react";
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
        message: err?.response?.data?.message ?? t("Failed to create personal space"),
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
      centered
      radius="md"
      size={420}
    >
      <Stack align="center" gap="md" pt="xs" pb="xs">
        <ThemeIcon size={56} radius="xl" variant="light" aria-hidden>
          <IconUser size={28} stroke={1.6} />
        </ThemeIcon>
        <Text size="sm" ta="center" c="dimmed" maw={320}>
          {t('This will create your personal space, named "Personal Space".')}
        </Text>
      </Stack>
      <Group grow mt="lg">
        <Button variant="default" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button
          onClick={handleConfirm}
          loading={createMutation.isPending}
          data-autofocus
        >
          {t("Create")}
        </Button>
      </Group>
    </Modal>
  );
}
