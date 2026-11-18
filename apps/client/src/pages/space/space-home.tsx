import React, { Suspense } from "react";
import { useParams } from "react-router-dom";
import { SpaceOverviewPage } from "@/ee/ui/space-overview/space-overview-page";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import SpaceHomePageSkeleton from "@/features/space/components/space-home-page-skeleton.tsx";

const SpaceHomePageView = React.lazy(
  () => import("@/features/space/components/space-home-page-view.tsx"),
);

export default function SpaceHome() {
  const { spaceSlug } = useParams();
  const { data: space, isFetchedAfterMount } = useGetSpaceBySlugQuery(
    spaceSlug,
    { staleTime: 0, refetchOnMount: true },
  );

  if (space?.homePage) {
    if (!isFetchedAfterMount) return <SpaceHomePageSkeleton />;
    return (
      <Suspense fallback={<SpaceHomePageSkeleton />}>
        <SpaceHomePageView
          key={space.homePage.id}
          space={space}
          homePage={space.homePage}
          fallback={<SpaceOverviewPage />}
        />
      </Suspense>
    );
  }

  return <SpaceOverviewPage />;
}
