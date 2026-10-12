import { Button } from "@mantine/core";
import { IconLock } from "@tabler/icons-react";
import { Link, Outlet, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";

// Layout route: shows a 403 page when the user can't access the :spaceSlug space.
export default function SpaceAccessGuard() {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { error } = useGetSpaceBySlugQuery(spaceSlug);

  if ((error as any)?.response?.status === 403) {
    return (
      <EmptyState
        icon={IconLock}
        title={t("403 - Access denied")}
        description={t("You don't have permission to access this space.")}
        action={
          <Button component={Link} to="/home" variant="default" size="sm" mt="xs">
            {t("Back to home")}
          </Button>
        }
      />
    );
  }

  return <Outlet />;
}
