import { ActionIcon, Group, Tooltip } from "@mantine/core";
import {
  IconClipboardCheck,
  IconHome,
  IconLibrary,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useVerificationListQuery } from "@/ee/page-verification/queries/page-verification-query";

export function SpaceGlobalLinks() {
  const { t } = useTranslation();
  const location = useLocation();
  const currentUser = useAtomValue(currentUserAtom);
  const { data } = useVerificationListQuery(
    {
      verifierId: currentUser?.user?.id,
      type: "qms",
      limit: 50,
    },
    !!currentUser?.user?.id,
  );

  const pending =
    data?.items.filter(
      (item) =>
        item.status === "in_approval" ||
        item.status === "needs_clarification",
    ).length ?? 0;

  const links = [
    { to: "/home", label: t("Home"), icon: IconHome },
    { to: "/reviews", label: t("Review queue"), icon: IconClipboardCheck, badge: pending },
    { to: "/documents", label: t("Document library"), icon: IconLibrary },
  ];

  return (
    <Group gap={4} px="sm" pb="xs" wrap="nowrap">
      {links.map((item) => (
        <Tooltip key={item.to} label={item.label} withArrow>
          <ActionIcon
            component={Link}
            to={item.to}
            variant={
              location.pathname.startsWith(item.to) ? "light" : "subtle"
            }
            color="gray"
            size="sm"
            aria-label={item.label}
            style={{ position: "relative" }}
          >
            <item.icon size={16} stroke={1.8} />
            {item.badge ? (
              <span
                style={{
                  position: "absolute",
                  top: -2,
                  right: -2,
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: "var(--mantine-color-orange-6)",
                }}
              />
            ) : null}
          </ActionIcon>
        </Tooltip>
      ))}
    </Group>
  );
}
