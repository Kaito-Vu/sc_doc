import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { validate as isValidUuid } from "uuid";
import { useAtomValue } from "jotai";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { UserHoverCard } from "@/features/user/components/user-hover-card";
import { getUserProfileUrl } from "@/lib/config";

type UserLinkProps = { userId?: string | null; children: ReactNode };

// wraps a rendered user name: hover shows the profile card, click opens the profile page.
// falls back to plain children where the profile is not readable (share / public routes, no id).
export function UserLink({ userId, children }: UserLinkProps) {
  const { pathname } = useLocation();
  const currentUser = useAtomValue(currentUserAtom);

  const enabled =
    !!currentUser &&
    !!userId &&
    isValidUuid(userId) &&
    !pathname.startsWith("/share") &&
    !pathname.startsWith("/docs/");
  if (!enabled) return <>{children}</>;

  return (
    <UserHoverCard userId={userId}>
      <Link
        to={getUserProfileUrl(userId)}
        onClick={(e) => e.stopPropagation()}
        style={{ color: "inherit", textDecoration: "none" }}
      >
        {children}
      </Link>
    </UserHoverCard>
  );
}
