import { useState } from "react";
import {
  Modal,
  Button,
  Stack,
  Alert,
  Loader,
  Group,
  Text,
} from "@mantine/core";
import { IconAlertCircle, IconCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";

interface AzureAdTestConnectionProps {
  opened: boolean
  onClose: () => void
  tenantId: string
  clientId: string
  clientSecret: string
}

export function AzureAdTestConnection({
  opened,
  onClose,
  tenantId,
  clientId,
  clientSecret,
}: Readonly<AzureAdTestConnectionProps>) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean
    message: string
    details?: string
  } | null>(null);

  const handleTest = async () => {
    if (!tenantId || !clientId || !clientSecret) {
      notifications.show({
        message: t("Please fill in all required fields"),
        color: "red",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/plugins/azure-ad/test-connection", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          clientId,
          clientSecret,
        }),
      });

      const data = (await response.json()) as Record<string, any>;

      if (response.ok) {
        setResult({
          success: true,
          message: t("Connection successful!"),
          details: `Tenant: ${data.tenantId || tenantId}`,
        });
        notifications.show({
          message: t("Azure AD connection is valid"),
          color: "green",
        });
      } else {
        setResult({
          success: false,
          message: data.message || t("Connection failed"),
          details: data.error || undefined,
        });
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : t("An error occurred");
      setResult({
        success: false,
        message: t("Failed to test connection"),
        details: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("Test Azure AD Connection")}
      centered
    >
      <Stack>
        {!result && (
          <Text size="sm" c="dimmed">
            {t(
              "Click the button below to verify your Azure AD credentials are correct."
            )}
          </Text>
        )}

        {result && (
          <Alert
            icon={
              result.success ? (
                <IconCheck size={16} />
              ) : (
                <IconAlertCircle size={16} />
              )
            }
            color={result.success ? "green" : "red"}
            variant="light"
          >
            <Stack gap="xs">
              <Text fw={500}>{result.message}</Text>
              {result.details && (
                <Text size="sm" c="dimmed">
                  {result.details}
                </Text>
              )}
            </Stack>
          </Alert>
        )}

        <Group justify="flex-end">
          {result && (
            <Button
              variant="light"
              onClick={() => setResult(null)}
              disabled={loading}
            >
              {t("Try Again")}
            </Button>
          )}
          {result?.success ? (
            <Button onClick={onClose} color="green">
              {t("Done")}
            </Button>
          ) : (
            <Button
              onClick={handleTest}
              loading={loading}
              disabled={!tenantId || !clientId || !clientSecret}
            >
              {loading ? <Loader size="xs" /> : t("Test Connection")}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  );
}
