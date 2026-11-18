import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useVerificationListQuery } from "@/ee/page-verification/queries/page-verification-query";

// NOTE: the list endpoint (POST /pages/verifications) returns no total and cannot filter by
// status, so this counts pending rows within the first page (limit 50) and undercounts beyond
// that. A correct count needs a server-side count endpoint. Every consumer must use this hook
// so they share one cached query.
export function usePendingReviewCount(): number {
  const currentUser = useAtomValue(currentUserAtom);
  const { data } = useVerificationListQuery(
    {
      verifierId: currentUser?.user?.id,
      type: "qms",
      limit: 50,
    },
    !!currentUser?.user?.id,
  );

  return (
    data?.items.filter(
      (item) =>
        item.status === "in_approval" ||
        item.status === "needs_clarification",
    ).length ?? 0
  );
}
