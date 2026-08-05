import { Badge, Group, Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { IRoleCount } from "@/ee/statistics/types/statistics.types";

interface UsersByRoleProps {
  data: IRoleCount[];
}

export default function UsersByRole({ data }: UsersByRoleProps) {
  const { t } = useTranslation();

  const roleLabels: Record<string, string> = {
    owner: t("Owner"),
    admin: t("Admin"),
    member: t("Member"),
  };

  const getRoleLabel = (role: string) =>
    roleLabels[role] ?? role.charAt(0).toUpperCase() + role.slice(1);

  return (
    <Paper withBorder p="md" radius="md">
      <Text fw={600} mb="sm">
        {t("Users by role")}
      </Text>
      <Group gap="md">
        {data.map((roleCount) => (
          <Group key={roleCount.role} gap={6}>
            <Text size="sm" c="dimmed">
              {getRoleLabel(roleCount.role)}
            </Text>
            <Badge variant="light">{roleCount.count}</Badge>
          </Group>
        ))}
      </Group>
    </Paper>
  );
}
