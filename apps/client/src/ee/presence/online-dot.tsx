import { Indicator } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { usePresenceOnline } from "./use-presence-online";

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
  const { data } = usePresenceOnline();
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
