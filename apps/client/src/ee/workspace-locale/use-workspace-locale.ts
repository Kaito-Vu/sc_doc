import { useEffect } from "react";
import { useAtomValue } from "jotai";
import { useTranslation } from "react-i18next";
import { userAtom, workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { normalizeLocale } from "@/lib/locales";

export function useLocaleForced(): boolean {
  const s = useAtomValue(workspaceAtom)?.settings as any;
  return !!(s?.forceLocale && s?.defaultLocale);
}

// When the admin forces a language, every user sees it (and the account
// language picker is disabled). When not forced, the user's own locale wins.
export function useWorkspaceLocale() {
  const { i18n } = useTranslation();
  const workspace = useAtomValue(workspaceAtom);
  const user = useAtomValue(userAtom);
  const forced = useLocaleForced();
  const target = normalizeLocale(
    forced
      ? (workspace?.settings as any)?.defaultLocale
      : user?.locale,
  );

  useEffect(() => {
    if (i18n.language !== target) i18n.changeLanguage(target);
  }, [target, i18n.language, i18n]);
}
