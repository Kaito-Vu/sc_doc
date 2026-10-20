import React, { useState } from "react";
import {
  Modal,
  Stack,
  Text,
  Button,
  Paper,
  Group,
  List,
  Code,
  Alert,
  PasswordInput,
} from "@mantine/core";
import { CopyValueButton } from "@/ee/components/copy-value-button";
import {
  IconRefresh,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { regenerateBackupCodes } from "@/ee/mfa";
import { usePasswordConfirmForm } from "@/ee/mfa/hooks/use-password-confirm-form";

interface MfaBackupCodesModalProps {
  opened: boolean;
  onClose: () => void;
}

export function MfaBackupCodesModal({
  opened,
  onClose,
}: MfaBackupCodesModalProps) {
  const { t } = useTranslation();
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showNewCodes, setShowNewCodes] = useState(false);
  const { form, requiresPassword } = usePasswordConfirmForm();

  const regenerateMutation = useMutation({
    mutationFn: (data: { confirmPassword?: string }) =>
      regenerateBackupCodes(data),
    onSuccess: (data) => {
      setBackupCodes(data.backupCodes);
      setShowNewCodes(true);
      form.reset();
      notifications.show({
        title: t("Success"),
        message: t("New backup codes have been generated"),
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: t("Error"),
        message:
          error.response?.data?.message ||
          t("Failed to regenerate backup codes"),
        color: "red",
      });
    },
  });

  const handleRegenerate = (values: { confirmPassword?: string }) => {
    // Only send confirmPassword if it's required (non-SSO users)
    const payload = requiresPassword
      ? { confirmPassword: values.confirmPassword }
      : {};
    regenerateMutation.mutate(payload);
  };

  const handleClose = () => {
    setShowNewCodes(false);
    setBackupCodes([]);
    form.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("Backup codes")}
      size="md"
    >
      <Stack gap="md">
        {!showNewCodes ? (
          <form onSubmit={form.onSubmit(handleRegenerate)}>
            <Stack gap="md">
              <Alert
                icon={<IconAlertCircle size={20} />}
                title={t("About backup codes")}
                color="blue"
                variant="light"
              >
                <Text size="sm">
                  {t(
                    "Backup codes can be used to access your account if you lose access to your authenticator app. Each code can only be used once.",
                  )}
                </Text>
              </Alert>

              <Text size="sm">
                {t(
                  "You can regenerate new backup codes at any time. This will invalidate all existing codes.",
                )}
              </Text>

              {requiresPassword && (
                <PasswordInput
                  label={t("Confirm password")}
                  placeholder={t("Enter your password")}
                  variant="filled"
                  visibilityToggleButtonProps={{
                    "aria-label": t("Toggle password visibility"),
                    "aria-hidden": false,
                    tabIndex: 0,
                  }}
                  {...form.getInputProps("confirmPassword")}
                  autoFocus
                  data-autofocus
                />
              )}

              <Button
                type="submit"
                fullWidth
                loading={regenerateMutation.isPending}
                leftSection={<IconRefresh size={18} />}
              >
                {t("Generate new backup codes")}
              </Button>
            </Stack>
          </form>
        ) : (
          <>
            <Alert
              icon={<IconAlertCircle size={20} />}
              title={t("Save your new backup codes")}
              color="yellow"
            >
              <Text size="sm">
                {t(
                  "Make sure to save these codes in a secure place. Your old backup codes are no longer valid.",
                )}
              </Text>
            </Alert>

            <Paper p="md" withBorder>
              <Group justify="space-between" mb="sm">
                <Text size="sm" fw={600}>
                  {t("Your new backup codes")}
                </Text>
                <CopyValueButton value={backupCodes.join("\n")} />
              </Group>
              <List size="sm" spacing="xs">
                {backupCodes.map((code, index) => (
                  <List.Item key={index}>
                    <Code>{code}</Code>
                  </List.Item>
                ))}
              </List>
            </Paper>

            <Button
              fullWidth
              onClick={handleClose}
              leftSection={<IconCheck size={18} />}
            >
              {t("I've saved my backup codes")}
            </Button>
          </>
        )}
      </Stack>
    </Modal>
  );
}
