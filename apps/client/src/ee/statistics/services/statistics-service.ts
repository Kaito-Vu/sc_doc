import api from "@/lib/api-client";
import {
  IContributorStat,
  ISpaceStats,
  IWorkspaceStats,
  StatsPeriod,
} from "@/ee/statistics/types/statistics.types";

export async function getWorkspaceStatistics(): Promise<IWorkspaceStats> {
  const req = await api.post<IWorkspaceStats>("/statistics/workspace", {});
  return req.data;
}

export async function getWorkspaceTopContributors(
  period: StatsPeriod,
): Promise<IContributorStat[]> {
  const req = await api.post<IContributorStat[]>(
    "/statistics/workspace/top-contributors",
    { period },
  );
  return req.data;
}

export async function getSpaceStatistics(
  spaceId: string,
): Promise<ISpaceStats> {
  const req = await api.post<ISpaceStats>("/statistics/space", { spaceId });
  return req.data;
}

export async function getSpaceTopContributors(
  spaceId: string,
  period: StatsPeriod,
): Promise<IContributorStat[]> {
  const req = await api.post<IContributorStat[]>(
    "/statistics/space/top-contributors",
    { spaceId, period },
  );
  return req.data;
}
