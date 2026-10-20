import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query";
import { useDocMetadataQuery } from "@/ee/docs";
import { recordRecentPageAtom } from "./atoms";

type RecentPageTrackerProps = {
  pageId: string;
  slugId: string;
  title: string;
  spaceSlug: string;
  icon?: string | null;
};

export function RecentPageTracker({
  pageId,
  slugId,
  title,
  spaceSlug,
  icon,
}: RecentPageTrackerProps) {
  const record = useSetAtom(recordRecentPageAtom);
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);
  useDocMetadataQuery(pageId);

  useEffect(() => {
    if (!pageId || !slugId || !spaceSlug) return;
    record({
      pageId,
      slugId,
      title: title || "",
      spaceSlug,
      spaceName: space?.name,
      icon,
      visitedAt: Date.now(),
    });
  }, [pageId, slugId, title, spaceSlug, space?.name, icon, record]);

  return null;
}
