import { useParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
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
import { lockPage, unlockPage } from "./page-lock-service";

const LOCK_TTL_MS = 24 * 60 * 60 * 1000;

// Mirrors the server: a lock lapses 24h after the last update.
export function isLockActive(page?: IPage): boolean {
  if (!page?.isLocked) return false;
  const last = Math.max(
    new Date(page.updatedAt).getTime(),
    page.lockedAt ? new Date(page.lockedAt).getTime() : 0,
  );
  return Date.now() - last < LOCK_TTL_MS;
}

export function usePageLock() {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const { data: me } = useCurrentUser();
  const { data: space } = useGetSpaceBySlugQuery(page?.space?.slug);
  const spaceAbility = useSpaceAbility(space?.membership?.permissions);

  const locked = isLockActive(page);
  const lockedByMe = locked && page?.lockedById === me?.user?.id;
  const canUnlock =
    locked &&
    (lockedByMe ||
      spaceAbility.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings));

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

  return { page, locked, lockedByMe, canUnlock, lock, unlock };
}
