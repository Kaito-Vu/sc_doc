import api from "@/lib/api-client";
import {
  IContributorStat,
  ISpaceStats,
  ISpaceOverview,
  ISpacesRanking,
  IWorkspaceExtraStats,
  IWorkspaceStats,
} from "@/ee/statistics/types/statistics.types";

export async function getWorkspaceStatistics(): Promise<IWorkspaceStats> {
  const req = await api.post<IWorkspaceStats>("/statistics/workspace", {});
  return req.data;
}

export async function getWorkspaceTopContributors(
  month: string,
): Promise<IContributorStat[]> {
  const req = await api.post<IContributorStat[]>(
    "/statistics/workspace/top-contributors",
    { month },
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
  month: string,
): Promise<IContributorStat[]> {
  const req = await api.post<IContributorStat[]>(
    "/statistics/space/top-contributors",
    { spaceId, month },
  );
  return req.data;
}

export async function getWorkspaceExtraStatistics(): Promise<IWorkspaceExtraStats> {
  const req = await api.post<IWorkspaceExtraStats>(
    "/statistics/workspace/overview-extra",
    {},
  );
  return req.data;
}

export async function getSpacesRanking(): Promise<ISpacesRanking> {
  const req = await api.post<ISpacesRanking>(
    "/statistics/workspace/spaces-ranking",
    {},
  );
  return req.data;
}

export async function getSpaceOverview(
  spaceId: string,
): Promise<ISpaceOverview> {
  const req = await api.post<ISpaceOverview>("/statistics/space/overview", {
    spaceId,
  });
  return req.data;
}
