import { Button, Group, Loader, Modal, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useSessionGuard } from "@/ee/session-guard/use-session-guard";

export function SessionGuardOverlay() {
  const { t } = useTranslation();
  const { pending, now, respond, responding } = useSessionGuard();
  const pendingDeadline = pending?.deadline;

  const secondsLeft = pendingDeadline
    ? Math.max(0, Math.ceil((pendingDeadline - now) / 1000))
    : 0;
  const canRespond = pending?.role === "existing" && pending.canRespond;
  const peerIp = pending?.peerIp || t("Unknown IP");
  const peerDevice = pending?.peerDevice || t("Unknown device");

  return (
    <Modal
      opened={!!pending}
      onClose={() => undefined}
      title={
        pending?.role === "existing"
          ? t("New login detected")
          : t("Waiting for approval from your other device")
      }
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      centered
    >
      {pending && (
        <Stack gap="md">
          {canRespond ? (
            <Text size="sm">
              {t(
                "A new login was detected from {{ip}} ({{device}}). You will be signed out in {{seconds}}s unless you reject it.",
                {
                  ip: peerIp,
                  device: peerDevice,
                  seconds: secondsLeft,
                },
              )}
            </Text>
          ) : pending.role === "existing" ? (
            <Text size="sm">
              {t(
                "A new login was detected from {{ip}}. This session will be signed out in {{seconds}}s.",
                { ip: peerIp, seconds: secondsLeft },
              )}
            </Text>
          ) : (
            <Stack gap="xs">
              <Group gap="sm" wrap="nowrap">
                <Loader size="sm" />
                <Text size="sm">
                  {t(
                    "This account is already signed in from {{ip}}. Waiting for approval on that device.",
                    { ip: peerIp },
                  )}
                </Text>
              </Group>
              <Text size="xs" c="dimmed">
                {t("Device: {{device}}", { device: peerDevice })}
              </Text>
              <Text size="xs" c="dimmed">
                {t("Time remaining: {{seconds}}s", { seconds: secondsLeft })}
              </Text>
            </Stack>
          )}

          {canRespond && (
            <Group justify="flex-end">
              <Button
                variant="default"
                onClick={() => respond("deny")}
                disabled={responding}
              >
                {t("Reject new login")}
              </Button>
              <Button
                color="red"
                onClick={() => respond("allow")}
                loading={responding}
              >
                {t("Allow and sign out this device")}
              </Button>
            </Group>
          )}
        </Stack>
      )}
    </Modal>
  );
}
