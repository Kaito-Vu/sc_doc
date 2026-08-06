export type StatsPeriod = "week" | "month" | "year";

export interface IWeeklyCount {
  weekStart: string;
  count: number;
}

export interface IRoleCount {
  role: string;
  count: number;
}

export interface IWorkspaceStats {
  totalPages: number;
  totalUsers: number;
  totalActiveUsers: number;
  totalSpaces: number;
  usersByRole: IRoleCount[];
  storageUsedBytes: number;
  usersNeverLoggedIn: number;
  pagesCreatedByWeek: IWeeklyCount[];
  usersJoinedByWeek: IWeeklyCount[];
}

export interface ISpaceStats {
  totalPages: number;
  totalMembers: number;
  pagesUpdatedLast7Days: number;
}

export interface IContributorStat {
  userId: string;
  name: string;
  avatarUrl: string | null;
  createdCount: number;
  editCount: number;
  contributionScore: number;
}
