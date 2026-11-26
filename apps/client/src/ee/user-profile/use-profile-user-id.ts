import { useQuery } from "@tanstack/react-query";
import { validate as isValidUuid } from "uuid";
import api from "@/lib/api-client";

export const userHandleKey = (handle: string) => ["user-handle", handle];

// /people/:param is either a user id or a handle ('<provider | local>-<email name>')
export function useProfileUserId(param: string | undefined) {
  const isId = isValidUuid(param ?? "");
  const { data, isPending } = useQuery({
    queryKey: userHandleKey(param ?? ""),
    queryFn: async () =>
      (await api.post<{ userId: string }>("/users/resolve-handle", { handle: param })).data,
    enabled: !!param && !isId,
    retry: false,
    staleTime: 60_000,
  });

  return {
    userId: isId ? param : data?.userId,
    resolving: !!param && !isId && isPending,
  };
}
