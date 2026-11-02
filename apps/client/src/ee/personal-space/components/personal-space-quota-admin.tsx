import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Group, Progress, Table, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  listPersonalQuotas,
  setPersonalQuota,
} from "@/ee/personal-space/services/personal-space-service";

const fmt = (n: number) =>
  n >= 1024 ** 3
    ? `${+(n / 1024 ** 3).toFixed(2)}gb`
    : `${+(n / 1024 ** 2).toFixed(1)}mb`;

function LimitEditor({
  userId,
  initial,
  placeholder,
}: {
  userId?: string;
  initial: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const save = useMutation({
    mutationFn: () => setPersonalQuota({ userId, limit: value.trim() || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal-space-quotas"] });
      qc.invalidateQueries({ queryKey: ["personal-space-usage"] });
    },
    onError: (e: any) =>
      notifications.show({
        color: "red",
        message: e?.response?.data?.message ?? t("Failed to save"),
      }),
  });
  return (
    <Group gap="xs" wrap="nowrap">
      <TextInput
        size="xs"
        w={110}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.currentTarget.value)}
      />
      <Button size="xs" variant="default" loading={save.isPending} onClick={() => save.mutate()}>
        {t("Save")}
      </Button>
    </Group>
  );
}

export default function PersonalSpaceQuotaAdmin() {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["personal-space-quotas"],
    queryFn: listPersonalQuotas,
  });
  if (!data) return null;

  return (
    <div>
      <Text size="md">{t("Personal space storage limit")}</Text>
      <Text size="sm" c="dimmed" mb="xs">
        {t("Default limit for every member. Override per member below (e.g. 500mb, 2gb). Leave empty to reset.")}
      </Text>
      <LimitEditor key={data.defaultLimit} initial={fmt(data.defaultLimit)} />
      <Table mt="md" verticalSpacing="xs">
        <Table.Tbody>
          {data.users.map((u) => (
            <Table.Tr key={u.userId}>
              <Table.Td>
                <Text size="sm">{u.name}</Text>
                <Text size="xs" c="dimmed">{u.email}</Text>
              </Table.Td>
              <Table.Td w={160}>
                <Progress value={Math.min(100, (u.used / u.limit) * 100)} size="xs" />
                <Text size="xs" c="dimmed">{fmt(u.used)} / {fmt(u.limit)}</Text>
              </Table.Td>
              <Table.Td>
                <LimitEditor
                  key={`${u.userId}-${u.override}`}
                  userId={u.userId}
                  initial={u.override === null ? "" : fmt(u.override)}
                  placeholder={t("Default")}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}
