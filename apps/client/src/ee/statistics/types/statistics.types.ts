export interface IWeeklyCount {
  weekStart: string;
  count: number;
}

export interface IRoleCount {
  role: string;
  count: number;
}

export interface IWorkspaceStats {
  /** Current month ("YYYY-MM") in the server's stats time zone. */
  currentMonth?: string;
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
  /** Current month ("YYYY-MM") in the server's stats time zone. */
  currentMonth?: string;
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

export interface IMonthlyTrendPoint {
  month: string; // YYYY-MM
  pagesCreated: number;
  activeEditors: number;
  newUsers: number;
  edits: number;
}

export interface IVerificationSummary {
  expiring: Record<string, number>;
  qms: Record<string, number>;
  total: number;
}

export interface IWorkspaceExtraStats {
  monthlyTrend: IMonthlyTrendPoint[];
  activeUsers: { last7Days: number; last30Days: number };
  stalePages: { over90Days: number; over180Days: number };
  verification: IVerificationSummary;
  comments: { createdThisMonth: number; unresolved: number };
}

export interface ISpaceRankRow {
  spaceId: string;
  name: string;
  slug: string;
  value: number;
}

export interface ISpacesRanking {
  month: string;
  byPages: (ISpaceRankRow & { editsThisMonth: number; memberCount: number })[];
  byStorage: ISpaceRankRow[];
  byStalePages: ISpaceRankRow[];
}

export interface ISpaceOverview {
  month: string;
  pagesCreated: number;
  pagesEdited: number;
  edits: number;
  comments: { createdInMonth: number; unresolved: number };
  stalePages90Days: number;
  mostEditedPages: {
    pageId: string;
    slugId: string;
    title: string;
    icon: string | null;
    edits: number;
  }[];
}
