import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { extractPageSlugId } from "@/lib";
import { queryClient } from "@/main.tsx";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import useCurrentUser from "@/features/user/hooks/use-current-user";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";
import { IPage } from "@/features/page/types/page.types";
import { getPlugins } from "@/ee/plugins/services/plugin-service";
import { getPageLockInfo, lockPage, unlockPage } from "./page-lock-service";

const LOCK_TTL_MS = 24 * 60 * 60 * 1000;

// Mirrors the server: a lock lapses 24h after it was taken.
export function isLockActive(page?: IPage): boolean {
  const expiresAt = getLockExpiresAt(page);
  return !!expiresAt && Date.now() < expiresAt.getTime();
}

export function getLockExpiresAt(page?: IPage): Date | null {
  if (!page?.isLocked || !page.lockedAt) return null;
  return new Date(new Date(page.lockedAt).getTime() + LOCK_TTL_MS);
}

export function usePageLock() {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const { data: me } = useCurrentUser();
  const { data: space } = useGetSpaceBySlugQuery(page?.space?.slug);
  const spaceAbility = useSpaceAbility(space?.membership?.permissions);

  // Settings > Plugins switch; the whole feature is hidden while it is off.
  const { data: plugins } = useQuery({
    queryKey: ["plugins", "page-lock"],
    queryFn: getPlugins,
    staleTime: 10_000,
  });
  const enabled = plugins?.some((p) => p.id === "page-lock" && p.enabled);

  const locked = !!enabled && isLockActive(page);
  const lockedByMe = locked && page?.lockedById === me?.user?.id;
  const canUnlock =
    locked &&
    (lockedByMe ||
      spaceAbility.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings));

  const { data: info } = useQuery({
    queryKey: ["page-lock", page?.id, page?.lockedById],
    queryFn: () => getPageLockInfo(page!.id),
    enabled: !!page?.id && locked,
  });

  const patch = (data: Partial<IPage>) => {
    for (const key of [page?.slugId, page?.id]) {
      queryClient.setQueryData<IPage>(
        ["pages", key],
        (old) => old && { ...old, ...data },
      );
    }
  };

  const onError = (err: any) =>
    notifications.show({
      message: err?.response?.data?.message ?? t("Something went wrong"),
      color: "red",
    });

  const lock = useMutation({
    mutationFn: () => lockPage(page!.id),
    onSuccess: () =>
      patch({ isLocked: true, lockedById: me?.user?.id, lockedAt: new Date() }),
    onError,
  });

  const unlock = useMutation({
    mutationFn: () => unlockPage(page!.id),
    onSuccess: () => {
      patch({ isLocked: false, lockedById: null, lockedAt: null });
      // a read-only collab connection only becomes writable by reconnecting
      if (!lockedByMe) window.location.reload();
    },
    onError,
  });

  return {
    enabled: !!enabled,
    page,
    locked,
    lockedByMe,
    canUnlock,
    lock,
    unlock,
    lockedBy: info?.lockedBy,
    lockedAt: page?.lockedAt ?? info?.lockedAt,
    expiresAt: getLockExpiresAt(page),
  };
}
