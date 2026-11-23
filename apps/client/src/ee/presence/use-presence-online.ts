import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client";

// One shared cached query: every OnlineDot reuses a single request per interval.
export function usePresenceOnline() {
  return useQuery({
    queryKey: ["presence-online"],
    queryFn: async () => (await api.post<string[]>("/presence/online")).data,
    refetchInterval: 30_000,
  });
}
