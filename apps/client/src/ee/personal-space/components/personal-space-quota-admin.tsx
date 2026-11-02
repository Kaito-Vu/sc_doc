import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Divider, Group, Progress, Table, Text, TextInput, Title } from "@mantine/core";
import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { notifications } from "@mantine/notifications";
import { modals } from "@mantine/modals";
import {
  listPersonalQuotas,
  restorePersonalSpace,
  revokePersonalSpace,
  setPersonalQuota,
  IPersonalQuotaUser,
} from "@/ee/personal-space/services/personal-space-service";

const toMb = (n: number) => +(n / 1024 ** 2).toFixed(1);

function RevokeButton({ user }: { user: IPersonalQuotaUser }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: () =>
      user.revoked ? restorePersonalSpace(user.userId) : revokePersonalSpace(user.userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["personal-space-quotas"] });
      qc.invalidateQueries({ queryKey: ["spaces"] });
    },
    onError: (e: any) =>
      notifications.show({
        color: "red",
        message: e?.response?.data?.message ?? t("Failed"),
      }),
  });
  if (user.revoked) {
    return (
      <Button size="xs" variant="default" loading={run.isPending} onClick={() => run.mutate()}>
        {t("Restore access")}
      </Button>
    );
  }
  return (
    <Button
      size="xs"
      color="red"
      variant="light"
      loading={run.isPending}
      onClick={() =>
        modals.openConfirmModal({
          title: t("Revoke personal space"),
          children: (
            <Text size="sm">
              {t("This permanently deletes {{name}}'s personal space and all its pages and files, and blocks them from creating a new one. This cannot be undone.", { name: user.name })}
            </Text>
          ),
          labels: { confirm: t("Revoke and delete"), cancel: t("Cancel") },
          confirmProps: { color: "red" },
          onConfirm: () => run.mutate(),
        })
      }
    >
      {t("Revoke")}
    </Button>
  );
}

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
    mutationFn: () => setPersonalQuota({ userId, limit: value.trim() ? `${value.trim()}mb` : null }),
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
        type="number"
        min={1}
        rightSection={<Text size="xs" c="dimmed">MB</Text>}
        rightSectionWidth={32}
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
  const { isAdmin } = useUserRole();
  const hasFeature = useHasFeature(Feature.PERSONAL_SPACES);
  const enabled =
    useAtomValue(workspaceAtom)?.settings?.spaces?.allowPersonal === true;
  const show = isAdmin && hasFeature && enabled;
  const { data } = useQuery({
    queryKey: ["personal-space-quotas"],
    queryFn: listPersonalQuotas,
    enabled: show,
  });
  if (!show || !data) return null;

  return (
    <div>
      <Divider my="xl" />
      <Title order={2} size="h4" mb="md">
        {t("Personal spaces")}
      </Title>
      <Text size="md">{t("Personal space storage limit")}</Text>
      <Text size="sm" c="dimmed" mb="xs">
        {t("Default limit for every member, in MB. Override per member below. Leave empty to reset.")}
      </Text>
      <LimitEditor key={data.defaultLimit} initial={String(toMb(data.defaultLimit))} />
      <Table mt="md" verticalSpacing="xs">
        <Table.Tbody>
          {data.users.map((u) => (
            <Table.Tr key={u.userId}>
              <Table.Td>
                <Text size="sm">{u.name}</Text>
                <Text size="xs" c="dimmed">{u.email}</Text>
              </Table.Td>
              <Table.Td w={160}>
                <Progress
                  value={Math.min(100, (u.used / u.limit) * 100)}
                  size="xs"
                  color={u.used >= u.limit ? "red" : "blue"}
                />
                <Text size="xs" c="dimmed">{toMb(Math.max(u.limit - u.used, 0))} / {toMb(u.limit)} MB {t("left")}</Text>
              </Table.Td>
              <Table.Td>
                {u.revoked ? (
                  <Text size="xs" c="dimmed">{t("Revoked")}</Text>
                ) : (
                <LimitEditor
                  key={`${u.userId}-${u.override}`}
                  userId={u.userId}
                  initial={u.override === null ? "" : String(toMb(u.override))}
                  placeholder={t("Default")}
                />
                )}
              </Table.Td>
              <Table.Td>
                <RevokeButton user={u} />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </div>
  );
}
