import { Outlet, useParams } from "react-router-dom";
import { RequestAccessPanel } from "@/ee/space-access-request/components/request-access-panel";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";

// Layout route: shows a 403 page when the user can't access the :spaceSlug space.
export default function SpaceAccessGuard() {
  const { spaceSlug } = useParams();
  const { error } = useGetSpaceBySlugQuery(spaceSlug);

  if ((error as any)?.response?.status === 403) {
    return <RequestAccessPanel spaceSlug={spaceSlug} />;
  }

  return <Outlet />;
}
