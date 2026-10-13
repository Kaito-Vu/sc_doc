import { UserProvider } from "@/features/user/user-provider.tsx";
import { Outlet, useParams } from "react-router-dom";
import GlobalAppShell from "@/components/layouts/global/global-app-shell.tsx";
import { PosthogUser } from "@/ee/components/posthog-user.tsx";
import { isCloud } from "@/lib/config.ts";
import { SearchSpotlight } from "@/features/search/components/search-spotlight.tsx";
import { EaImportTracker } from "@/ee/ea-import/ea-import-tracker.tsx";
import { ShortcutsHelp } from "@/ee/shortcuts/shortcuts.tsx";
import "@/ee/styles/sc-tokens.css";
import React from "react";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";

export default function Layout() {
  const { spaceSlug } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);

  return (
    <UserProvider>
      <GlobalAppShell>
        <Outlet />
      </GlobalAppShell>
      {isCloud() && <PosthogUser />}
      <EaImportTracker />
      <ShortcutsHelp />
      <SearchSpotlight spaceId={space?.id} />
    </UserProvider>
  );
}
