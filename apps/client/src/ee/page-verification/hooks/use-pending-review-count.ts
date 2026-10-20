import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useVerificationListQuery } from "@/ee/page-verification/queries/page-verification-query";

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
