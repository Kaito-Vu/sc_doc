import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { getSpaces } from "@/features/space/services/space-service";

export function useInfiniteSpaces(query: string, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["spaces", "infinite", query],
    queryFn: ({ pageParam }) =>
      getSpaces({ query: query || undefined, limit: 30, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.meta.hasNextPage ? (last.meta.nextCursor ?? undefined) : undefined,
    placeholderData: keepPreviousData,
    enabled,
  });
}
