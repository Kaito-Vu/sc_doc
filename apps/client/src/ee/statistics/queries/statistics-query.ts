import {
  keepPreviousData,
  useQuery,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  getSpaceStatistics,
  getSpaceTopContributors,
  getWorkspaceStatistics,
  getWorkspaceTopContributors,
} from "@/ee/statistics/services/statistics-service";
import {
  IContributorStat,
  ISpaceStats,
  IWorkspaceStats,
  StatsPeriod,
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
  period: StatsPeriod,
  enabled: boolean,
): UseQueryResult<IContributorStat[], Error> {
  return useQuery({
    queryKey: ["workspace-top-contributors", period],
    queryFn: () => getWorkspaceTopContributors(period),
    // Keep the current list on screen while another period loads.
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
  period: StatsPeriod,
  enabled: boolean,
): UseQueryResult<IContributorStat[], Error> {
  return useQuery({
    queryKey: ["space-top-contributors", spaceId, period],
    queryFn: () => getSpaceTopContributors(spaceId, period),
    // Only across a period switch; never show another space's contributors.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === spaceId ? prev : undefined,
    enabled: enabled && !!spaceId,
  });
}
