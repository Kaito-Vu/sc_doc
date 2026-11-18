import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { recordRecentSpaceAtom } from "./space-visit-atoms";

type Props = { id: string; slug: string; name: string; logo?: string | null };

export function SpaceVisitTracker({ id, slug, name, logo }: Props) {
  const record = useSetAtom(recordRecentSpaceAtom);
  useEffect(() => {
    if (id) record({ id, slug, name, logo });
  }, [id, slug, name, logo, record]);
  return null;
}
