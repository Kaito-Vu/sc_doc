import { Indicator } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "@/lib/api-client";

// Wraps children (the avatar) with an online/offline dot. All instances share
// one cached query, so the table triggers a single request per interval.
export function OnlineDot({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ["presence-online"],
    queryFn: async () => (await api.post<string[]>("/presence/online")).data,
    refetchInterval: 30_000,
  });
  const online = data?.includes(userId);

  return (
    <Indicator
      inline
      size={10}
      offset={4}
      position="bottom-end"
      withBorder
      color={online ? "green" : "gray"}
      title={online ? t("Online") : t("Offline")}
    >
      {children}
    </Indicator>
  );
}
