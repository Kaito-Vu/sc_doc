import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client";

export interface IUserProfileExtras {
  /** '<provider | local>-<email name>'; null when not unique */
  handle: string | null;
  jobTitle: string | null;
  department: string | null;
  employeeId: string | null;
  heatmap: { date: string; count: number }[];
  heatmapFrom: string;
  heatmapTo: string;
}

async function getUserProfileExtras(userId: string): Promise<IUserProfileExtras> {
  const req = await api.post<IUserProfileExtras>("/users/profile-extras", {
    userId,
  });
  return req.data;
}

export function useUserProfileExtrasQuery(userId: string | undefined) {
  return useQuery({
    queryKey: ["user-profile-extras", userId],
    queryFn: () => getUserProfileExtras(userId),
    enabled: !!userId,
    staleTime: 60_000,
  });
}
