import { Badge } from "@mantine/core";
import { IconUserCheck } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import classes from "@/components/layouts/global/global-sidebar.module.css";
import { SidebarNavItem } from "@/ee/ui/sidebar/sidebar-components";
import {
  useAccessRequestCountQuery,
  useSpaceAccessRequestEnabled,
} from "@/ee/space-access-request/queries/space-access-request-query";

// Visible only to approvers (count is 0 for everyone else) while the plugin is on.
function useNavState() {
  const enabled = useSpaceAccessRequestEnabled();
  const { data: count = 0 } = useAccessRequestCountQuery(enabled);
  return { show: enabled && count > 0, count };
}

export function AccessRequestsNavItem({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  const location = useLocation();
  const { show, count } = useNavState();
  if (!show) return null;
  return (
    <SidebarNavItem
      icon={IconUserCheck}
      label={t("Access requests")}
      to="/access-requests"
      active={location.pathname.startsWith("/access-requests")}
      badge={count}
      onNavigate={onNavigate}
    />
  );
}

// Classic sidebar variant.
export function AccessRequestsNavLink() {
  const { t } = useTranslation();
  const location = useLocation();
  const { show, count } = useNavState();
  if (!show) return null;
  return (
    <Link
      className={classes.link}
      data-active={location.pathname.startsWith("/access-requests") || undefined}
      to="/access-requests"
    >
      <IconUserCheck className={classes.linkIcon} size={16} stroke={2} />
      <span style={{ flex: 1 }}>{t("Access requests")}</span>
      <Badge size="xs" variant="light" color="orange">
        {count}
      </Badge>
    </Link>
  );
}
