import { Progress, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  usePersonalSpaceQuery,
  usePersonalSpaceUsageQuery,
} from "@/ee/personal-space/queries/personal-space-query";
import classes from "@/ee/ui/space-overview/space-overview-page.module.css";

const fmt = (n: number) =>
  n >= 1024 ** 3
    ? `${+(n / 1024 ** 3).toFixed(2)} GB`
    : `${+(Math.max(n, 0) / 1024 ** 2).toFixed(1)} MB`;

// Renders only on the viewer's own personal space.
export default function PersonalSpaceQuotaCard({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { data: mine } = usePersonalSpaceQuery(true);
  const isMine = mine?.id === spaceId;
  const { data: usage } = usePersonalSpaceUsageQuery(isMine);
  if (!isMine || !usage) return null;

  const left = Math.max(usage.limit - usage.used, 0);
  const pct = usage.limit > 0 ? Math.min(100, (usage.used / usage.limit) * 100) : 0;

  return (
    <section className={classes.card}>
      <div className={classes.cardHeader}>
        <h2 className={classes.cardTitle}>{t("Storage quota")}</h2>
      </div>
      <Text fw={600}>
        {fmt(left)} / {fmt(usage.limit)}
      </Text>
      <Text size="xs" c="dimmed" mb={6}>
        {t("left")}
      </Text>
      <Progress
        value={pct}
        size="sm"
        color={pct >= 95 ? "red" : pct >= 80 ? "yellow" : "blue"}
      />
    </section>
  );
}
