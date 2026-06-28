import { useEffect, useState } from "react";
import {
  Stack,
  Button,
  TextInput,
  Switch,
  Card,
  Badge,
  Progress,
  Text,
  Alert,
  Loader,
  PasswordInput,
  Group,
} from "@mantine/core";
import { IconAlertCircle, IconCheck, IconX } from "@tabler/icons-react";
import SettingsTitle from "@/components/settings/settings-title";
import { useTranslation } from "react-i18next";
import { showNotification } from "@mantine/notifications";

interface MinioConfig {
  workspaceId: string;
  minioEndpoint: string;
  minioAccessKey: string;
  minioUseSsl: boolean;
  isConfigured: boolean;
  isEnabled: boolean;
  healthStatus?: string;
}

interface MigrationStatus {
  status: "idle" | "in_progress" | "completed" | "failed";
  progress: number;
  processedFiles: number;
  totalFiles: number;
  eta?: string;
  error?: string;
  remainingTime?: string;
}

export default function MinioSettings() {
  const { t } = useTranslation();

  const [config, setConfig] = useState<MinioConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<MigrationStatus | null>(null);

  const [formData, setFormData] = useState({
    minioEndpoint: "",
    minioAccessKey: "",
    minioSecretKey: "",
    minioUseSsl: false,
    gcSoftDeleteGraceDays: 30,
    gcVersionRetentionDays: 90,
  });

  const [newHostData, setNewHostData] = useState({
    newEndpoint: "",
    accessKey: "",
    secretKey: "",
    useSSL: false,
  });

  useEffect(() => {
    fetchConfig();
    const interval = setInterval(() => {
      if (migrationStatus?.status === "in_progress") {
        fetchMigrationStatus();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch(
        `/api/v1/workspace/integrations/minio/config`
      );
      const data = await response.json();

      if (data.isConfigured === false) {
        setConfig(null);
      } else {
        setConfig(data);
        setFormData({
          minioEndpoint: data.minioEndpoint || "",
          minioAccessKey: data.minioAccessKey || "",
          minioSecretKey: "",
          minioUseSsl: data.minioUseSsl || false,
          gcSoftDeleteGraceDays: 30,
          gcVersionRetentionDays: 90,
        });
      }
      fetchMigrationStatus();
    } catch (error) {
      console.error("Failed to load MinIO configuration:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchMigrationStatus = async () => {
    try {
      const response = await fetch(
        `/api/v1/workspace/integrations/minio/migration-status`
      );
      const data = await response.json();
      setMigrationStatus(data);
    } catch (error) {
      console.error("Failed to fetch migration status:", error);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const response = await fetch(
        `/api/v1/workspace/integrations/minio/test-connection`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            minioEndpoint: formData.minioEndpoint,
            minioAccessKey: formData.minioAccessKey,
            minioSecretKey: formData.minioSecretKey,
            minioUseSsl: formData.minioUseSsl,
          }),
        }
      );

      const data = await response.json();

      if (data.success) {
        showNotification({
          title: "Success",
          message: "Connection successful",
          color: "green",
          icon: <IconCheck />,
        });
      } else {
        showNotification({
          title: "Connection Failed",
          message: data.message || "Unable to connect to MinIO",
          color: "red",
          icon: <IconX />,
        });
      }
    } catch (error) {
      showNotification({
        title: "Error",
        message: t("Failed to test connection"),
        color: "red",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/v1/workspace/integrations/minio/config`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to save configuration");
      }

      const data = await response.json();

      if (data.success) {
        showNotification({
          title: "Success",
          message: "MinIO configuration saved",
          color: "green",
          icon: <IconCheck />,
        });
        fetchConfig();
      }
    } catch (error) {
      showNotification({
        title: "Error",
        message: error instanceof Error ? error.message : t("Failed to save configuration"),
        color: "red",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartMigration = async () => {
    setIsSaving(true);
    try {
      const response = await fetch(
        `/api/v1/workspace/integrations/minio/start-migration`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(newHostData),
        }
      );

      const data = await response.json();

      if (data.success) {
        showNotification({
          title: "Success",
          message: "Migration started",
          color: "green",
          icon: <IconCheck />,
        });
        setNewHostData({ newEndpoint: "", accessKey: "", secretKey: "", useSSL: false });
        fetchMigrationStatus();
      } else {
        throw new Error(data.message || "Failed to start migration");
      }
    } catch (error) {
      showNotification({
        title: "Error",
        message: error instanceof Error ? error.message : t("Failed to start migration"),
        color: "red",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelMigration = async () => {
    try {
      const response = await fetch(
        `/api/v1/workspace/integrations/minio/cancel-migration`,
        { method: "POST" }
      );

      const data = await response.json();

      if (data.success) {
        showNotification({
          title: "Success",
          message: "Migration cancelled",
          color: "green",
        });
        fetchMigrationStatus();
      }
    } catch (error) {
      showNotification({
        title: "Error",
        message: t("Failed to cancel migration"),
        color: "red",
      });
    }
  };

  const handleRollback = async () => {
    try {
      const response = await fetch(
        `/api/v1/workspace/integrations/minio/rollback`,
        { method: "POST" }
      );

      const data = await response.json();

      if (data.success) {
        showNotification({
          title: "Success",
          message: "Rolled back to previous host",
          color: "green",
        });
        fetchConfig();
      }
    } catch (error) {
      showNotification({
        title: "Error",
        message: t("Failed to rollback"),
        color: "red",
      });
    }
  };

  if (isLoading) {
    return <Loader />;
  }

  if (!config) {
    return (
      <Stack>
        <SettingsTitle title="MinIO Configuration" />
        <Card withBorder>
          <Text fw={500} mb="md">
            MinIO Not Configured
          </Text>
          <Text size="sm" c="dimmed">
            MinIO object storage provides reliable, scalable file storage for your documents and attachments.
            Configure MinIO to enable advanced storage features.
          </Text>
        </Card>

        <Card withBorder title="Setup MinIO">
          <Stack gap="md">
            <TextInput
              label="MinIO Endpoint"
              placeholder="minio.example.com:9000"
              value={formData.minioEndpoint}
              onChange={(e) =>
                setFormData({ ...formData, minioEndpoint: e.currentTarget.value })
              }
            />

            <TextInput
              label="Access Key"
              placeholder="minioadmin"
              value={formData.minioAccessKey}
              onChange={(e) =>
                setFormData({ ...formData, minioAccessKey: e.currentTarget.value })
              }
            />

            <PasswordInput
              label="Secret Key"
              placeholder="minioadmin"
              value={formData.minioSecretKey}
              onChange={(e) =>
                setFormData({ ...formData, minioSecretKey: e.currentTarget.value })
              }
            />

            <Switch
              label="Use SSL/TLS"
              checked={formData.minioUseSsl}
              onChange={(e) =>
                setFormData({ ...formData, minioUseSsl: e.currentTarget.checked })
              }
            />

            <Group>
              <Button
                variant="outline"
                loading={isTesting}
                onClick={handleTestConnection}
              >
                Test Connection
              </Button>
              <Button loading={isSaving} onClick={handleSaveConfig}>
                Save Configuration
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    );
  }

  return (
    <Stack>
      <SettingsTitle title="MinIO Configuration" />

      <Card withBorder>
        <Group justify="space-between" mb="lg">
          <Text fw={500}>Current Configuration</Text>
          <Badge color={config.healthStatus === "healthy" ? "green" : "red"}>
            {config.healthStatus || "Unknown"}
          </Badge>
        </Group>

        <Stack gap="md">
          <div>
            <Text size="sm" fw={500}>
              Endpoint
            </Text>
            <Text size="sm" c="dimmed">
              {config.minioEndpoint}
            </Text>
          </div>

          <div>
            <Text size="sm" fw={500}>
              Access Key
            </Text>
            <Text size="sm" c="dimmed">
              {config.minioAccessKey}
            </Text>
          </div>

          <div>
            <Text size="sm" fw={500}>
              SSL/TLS
            </Text>
            <Text size="sm" c="dimmed">
              {config.minioUseSsl ? "Enabled" : "Disabled"}
            </Text>
          </div>
        </Stack>
      </Card>

      {migrationStatus && migrationStatus.status !== "idle" && (
        <Card withBorder>
          <Text fw={500} mb="md">
            Migration Status
          </Text>

          <Stack gap="md">
            <Group justify="space-between">
              <Text size="sm">
                {migrationStatus.processedFiles} / {migrationStatus.totalFiles} files
              </Text>
              <Badge
                color={
                  migrationStatus.status === "completed"
                    ? "green"
                    : migrationStatus.status === "failed"
                      ? "red"
                      : "blue"
                }
              >
                {migrationStatus.status}
              </Badge>
            </Group>

            <Progress value={migrationStatus.progress} />

            {migrationStatus.remainingTime && (
              <Text size="sm" c="dimmed">
                {migrationStatus.remainingTime}
              </Text>
            )}

            {migrationStatus.error && (
              <Alert icon={<IconAlertCircle />} color="red" title="Error">
                {migrationStatus.error}
              </Alert>
            )}

            {migrationStatus.status === "in_progress" && (
              <Button
                variant="outline"
                color="red"
                onClick={handleCancelMigration}
              >
                Cancel Migration
              </Button>
            )}

            {migrationStatus.status === "completed" && (
              <Button variant="outline" onClick={handleRollback}>
                Rollback to Previous Host
              </Button>
            )}
          </Stack>
        </Card>
      )}

      <Card withBorder title="Change MinIO Host">
        <Stack gap="md">
          <TextInput
            label="New MinIO Endpoint"
            placeholder="new-minio.example.com:9000"
            value={newHostData.newEndpoint}
            onChange={(e) =>
              setNewHostData({ ...newHostData, newEndpoint: e.currentTarget.value })
            }
          />

          <TextInput
            label="Access Key"
            placeholder="minioadmin"
            value={newHostData.accessKey}
            onChange={(e) =>
              setNewHostData({ ...newHostData, accessKey: e.currentTarget.value })
            }
          />

          <PasswordInput
            label="Secret Key"
            placeholder="minioadmin"
            value={newHostData.secretKey}
            onChange={(e) =>
              setNewHostData({ ...newHostData, secretKey: e.currentTarget.value })
            }
          />

          <Switch
            label="Use SSL/TLS"
            checked={newHostData.useSSL}
            onChange={(e) =>
              setNewHostData({ ...newHostData, useSSL: e.currentTarget.checked })
            }
          />

          <Button
            loading={isSaving}
            onClick={handleStartMigration}
            disabled={migrationStatus?.status === "in_progress"}
          >
            Start Migration
          </Button>
        </Stack>
      </Card>
    </Stack>
  );
}
