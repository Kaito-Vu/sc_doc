import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useDebouncedValue } from "@mantine/hooks";
import { useFavoritesQuery } from "@/features/favorite/queries/favorite-query";
import { ISpace } from "@/features/space/types/space.types";
import { recentSpacesListAtom } from "./space-visit-atoms";
import { useInfiniteSpaces } from "./use-infinite-spaces";
import { buildSwitcherSections, SwitcherSpace } from "./space-switcher-data";

const fromSpace = (s: ISpace): SwitcherSpace => ({
  id: s.id,
  slug: s.slug,
  name: s.name,
  logo: s.logo,
  isArchived: !!s.archivedAt,
  isPublished: s.isPublished,
  isPersonal: s.isPersonal,
});

export function useSpaceSwitcherData(rawQuery: string, enabled = true) {
  const trimmed = rawQuery.trim();
  const [query] = useDebouncedValue(trimmed, 300);
  const favoritesQuery = useFavoritesQuery("space");
  const spacesQuery = useInfiniteSpaces(query, enabled);
  const recentSpaces = useAtomValue(recentSpacesListAtom);

  const all = useMemo(
    () =>
      (spacesQuery.data?.pages ?? []).flatMap((p) => p.items).map(fromSpace),
    [spacesQuery.data],
  );
  const favorites = useMemo<SwitcherSpace[]>(
    () =>
      (favoritesQuery.data?.pages ?? [])
        .flatMap((p) => p.items)
        .flatMap((f) =>
          f.space
            ? [
                {
                  id: f.space.id,
                  slug: f.space.slug,
                  name: f.space.name,
                  logo: f.space.logo,
                  isArchived: !!f.space.archivedAt,
                },
              ]
            : [],
        ),
    [favoritesQuery.data],
  );

  const fullyLoaded = !!spacesQuery.data && !spacesQuery.hasNextPage;
  const knownIds = useMemo(
    () => (fullyLoaded && !query ? new Set(all.map((s) => s.id)) : undefined),
    [fullyLoaded, query, all],
  );

  const sections = useMemo(
    () =>
      buildSwitcherSections({
        favorites,
        recent: recentSpaces,
        all,
        query,
        knownIds,
      }),
    [favorites, recentSpaces, all, query, knownIds],
  );

  return {
    sections,
    /** true while typed text is not yet applied (debounce) or results are fetching */
    isPending:
      trimmed !== query ||
      spacesQuery.isLoading ||
      spacesQuery.isPlaceholderData,
    hasNextPage: !!spacesQuery.hasNextPage,
    isFetchingNextPage: spacesQuery.isFetchingNextPage,
    fetchNextPage: spacesQuery.fetchNextPage,
  };
}
