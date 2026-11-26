import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Heatmap } from "@mantine/charts";
import { getUserProfileUrl } from "@/lib/config";
import { userHandleKey } from "./use-profile-user-id";
import { Group, Paper, ScrollArea, Skeleton, Text, Title } from "@mantine/core";
import { useTranslation } from "react-i18next";
import "@mantine/charts/styles.css";
import { UserCardExtras } from "./user-card-extras";
import { useUserProfileExtrasQuery } from "./user-profile-extras.api";

// profile page block: job info + 12-month contribution heatmap (pages created + edited)
export function UserProfileExtras({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const { data } = useUserProfileExtrasQuery(userId);
  const { userId: param } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // an id URL is rewritten to the user's handle; the cache seed avoids a resolve round trip
  useEffect(() => {
    if (!data?.handle || param !== userId) return;
    queryClient.setQueryData(userHandleKey(data.handle), { userId });
    navigate(getUserProfileUrl(encodeURIComponent(data.handle)), { replace: true });
  }, [data?.handle, param, userId]);

  if (!data) return <Skeleton height={160} radius="md" />;

  const total = data.heatmap.reduce((sum, d) => sum + d.count, 0);

  return (
    <Paper withBorder radius="md" p="lg">
      <UserCardExtras userId={userId} />
      <Group justify="space-between" mt="md" mb="xs">
        <Title order={4}>{t("Contributions")}</Title>
        <Text size="sm" c="dimmed">
          {t("{{count}} in the last year", { count: total })}
        </Text>
      </Group>
      <ScrollArea type="auto">
        <Heatmap
          data={Object.fromEntries(data.heatmap.map((d) => [d.date, d.count]))}
          startDate={data.heatmapFrom}
          endDate={data.heatmapTo}
          rectSize={12}
          gap={3}
          withMonthLabels
          withWeekdayLabels
          withTooltip
          withLegend
          legendLabels={[t("Less"), t("More")]}
          getTooltipLabel={({ date, value }) => `${date}: ${value ?? 0}`}
        />
      </ScrollArea>
    </Paper>
  );
}
