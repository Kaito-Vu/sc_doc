import { Badge } from "@mantine/core";
import { IconClipboardCheck, IconLibrary } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import classes from "@/components/layouts/global/global-sidebar.module.css";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useVerificationListQuery } from "@/ee/page-verification/queries/page-verification-query";

export function NavExtras() {
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
