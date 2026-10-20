import { Badge } from "@mantine/core";
import { IconClipboardCheck, IconLibrary } from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import classes from "@/components/layouts/global/global-sidebar.module.css";
import { usePendingReviewCount } from "@/ee/page-verification/hooks/use-pending-review-count";

export function NavExtras() {
  const { t } = useTranslation();
  const location = useLocation();
  const pending = usePendingReviewCount();

  return (
    <div className={classes.section}>
      <Link
        className={classes.link}
        data-active={location.pathname.startsWith("/reviews") || undefined}
        to="/reviews"
      >
        <IconClipboardCheck
          className={classes.linkIcon}
          size={16}
          stroke={2}
        />
        <span style={{ flex: 1 }}>{t("Review queue")}</span>
        {pending > 0 && (
          <Badge size="xs" variant="light" color="orange">
            {pending}
          </Badge>
        )}
      </Link>
      <Link
        className={classes.link}
        data-active={location.pathname.startsWith("/documents") || undefined}
        to="/documents"
      >
        <IconLibrary className={classes.linkIcon} size={16} stroke={2} />
        <span>{t("Document library")}</span>
      </Link>
    </div>
  );
}
