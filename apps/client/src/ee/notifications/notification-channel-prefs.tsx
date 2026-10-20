import { Group, Stack, Switch, Text, Title } from "@mantine/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  NotificationChannel,
  NotificationPrefs,
  getNotificationPreferences,
  updateNotificationPreference,
} from "./notification-preferences.service";

const QUERY_KEY = ["notification-preferences"];

const GROUPS: { key: string; label: string; description: string }[] = [
  { key: "page.updated", label: "Page updates", description: "Get notified when pages you watch are updated." },
  { key: "page.lifecycle", label: "Page activity", description: "Get notified when pages are created, trashed, restored or moved." },
  { key: "page.userMention", label: "Page mentions", description: "Get notified when someone mentions you on a page." },
  { key: "page.permission_granted", label: "Page access", description: "Get notified when you are given access to a page." },
  { key: "comment.userMention", label: "Comment mentions", description: "Get notified when someone mentions you in a comment." },
  { key: "comment.created", label: "New comments", description: "Get notified about new comments on threads you participate in." },
  { key: "comment.resolved", label: "Resolved comments", description: "Get notified when your comment is resolved." },
  { key: "space.membership", label: "Space membership", description: "Get notified when you are added to or removed from a space." },
  { key: "page.verification", label: "Page verification", description: "Get notified about page approvals and verification." },
];

export default function NotificationChannelPrefs() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getNotificationPreferences,
  });

  const mutation = useMutation({
    mutationFn: updateNotificationPreference,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<NotificationPrefs>(QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<NotificationPrefs>(QUERY_KEY, {
          ...previous,
          [vars.group]: { ...previous[vars.group], [vars.channel]: vars.enabled },
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => queryClient.setQueryData(QUERY_KEY, ctx?.previous),
    onSuccess: (groups) => queryClient.setQueryData(QUERY_KEY, groups),
  });

  const channels: { key: NotificationChannel; label: string }[] = [
    { key: "web", label: t("In-app") },
    { key: "email", label: t("Email") },
  ];

  return (
    <Stack gap="sm">
      <Title order={2} size="h5">{t("Notifications")}</Title>

      {data &&
        GROUPS.map((group) => (
          <Group key={group.key} justify="space-between" wrap="nowrap" align="flex-start">
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="md">{t(group.label)}</Text>
              <Text size="sm" c="dimmed">{t(group.description)}</Text>
            </div>
            <Group gap="md" wrap="nowrap">
              {channels.map((channel) => (
                <Switch
                  key={channel.key}
                  label={channel.label}
                  labelPosition="left"
                  checked={data[group.key]?.[channel.key] ?? true}
                  onChange={(e) =>
                    mutation.mutate({
                      group: group.key,
                      channel: channel.key,
                      enabled: e.currentTarget.checked,
                    })
                  }
                />
              ))}
            </Group>
          </Group>
        ))}
    </Stack>
  );
}
