import {
  keepPreviousData,
  useQuery,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  getSpaceOverview,
  getSpaceStatistics,
  getSpacesRanking,
  getSpaceTopContributors,
  getWorkspaceExtraStatistics,
  getWorkspaceStatistics,
  getWorkspaceTopContributors,
} from "@/ee/statistics/services/statistics-service";
import {
  IContributorStat,
  ISpaceOverview,
  ISpaceStats,
  ISpacesRanking,
  IWorkspaceExtraStats,
  IWorkspaceStats,
} from "@/ee/statistics/types/statistics.types";

export function useWorkspaceStatisticsQuery(
  enabled: boolean,
): UseQueryResult<IWorkspaceStats, Error> {
  return useQuery({
    queryKey: ["workspace-statistics"],
    queryFn: () => getWorkspaceStatistics(),
    enabled,
  });
}

export function useWorkspaceTopContributorsQuery(
  month: string,
  enabled: boolean,
): UseQueryResult<IContributorStat[], Error> {
  return useQuery({
    queryKey: ["workspace-top-contributors", month],
    queryFn: () => getWorkspaceTopContributors(month),
    // Keep the current list on screen while another month loads.
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useSpaceStatisticsQuery(
  spaceId: string,
  enabled: boolean,
): UseQueryResult<ISpaceStats, Error> {
  return useQuery({
    queryKey: ["space-statistics", spaceId],
    queryFn: () => getSpaceStatistics(spaceId),
    enabled: enabled && !!spaceId,
  });
}

export function useSpaceTopContributorsQuery(
  spaceId: string,
  month: string,
  enabled: boolean,
): UseQueryResult<IContributorStat[], Error> {
  return useQuery({
    queryKey: ["space-top-contributors", spaceId, month],
    queryFn: () => getSpaceTopContributors(spaceId, month),
    // Only across a month switch; never show another space's contributors.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === spaceId ? prev : undefined,
    enabled: enabled && !!spaceId,
  });
}

export function useWorkspaceExtraStatisticsQuery(
  enabled: boolean,
): UseQueryResult<IWorkspaceExtraStats, Error> {
  return useQuery({
    queryKey: ["workspace-statistics-extra"],
    queryFn: () => getWorkspaceExtraStatistics(),
    enabled,
  });
}

export function useSpacesRankingQuery(
  enabled: boolean,
): UseQueryResult<ISpacesRanking, Error> {
  return useQuery({
    queryKey: ["workspace-spaces-ranking"],
    queryFn: () => getSpacesRanking(),
    enabled,
  });
}

export function useSpaceOverviewQuery(
  spaceId: string,
  enabled: boolean,
): UseQueryResult<ISpaceOverview, Error> {
  return useQuery({
    queryKey: ["space-statistics-overview", spaceId],
    queryFn: () => getSpaceOverview(spaceId),
    enabled: enabled && !!spaceId,
  });
}
