import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { useDebouncedValue } from "@mantine/hooks";
import { useFavoritesQuery } from "@/features/favorite/queries/favorite-query";
import { recentSpacesListAtom } from "./space-visit-atoms";
import { useInfiniteSpaces } from "./use-infinite-spaces";
import {
  buildSwitcherSections,
  fromFavoriteSpace,
  fromSpace,
  knownSpaceIds,
  SwitcherSpace,
} from "./space-switcher-data";

/** The one data path for space lists (switcher, sidebar, command palette). */
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
        .flatMap((f) => (f.space ? [fromFavoriteSpace(f.space)] : [])),
    [favoritesQuery.data],
  );

  const knownIds = useMemo(
    () =>
      knownSpaceIds(all, {
        loaded: !!spacesQuery.data,
        hasNextPage: !!spacesQuery.hasNextPage,
        query,
      }),
    [spacesQuery.data, spacesQuery.hasNextPage, query, all],
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
