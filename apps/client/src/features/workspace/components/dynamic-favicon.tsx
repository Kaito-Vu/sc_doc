import { useEffect } from "react";
import { useAtom } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { getAvatarUrl } from "@/lib/config";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";

const DYNAMIC_FAVICON_ATTR = "data-dynamic-favicon";

export default function DynamicFavicon() {
  const [workspace] = useAtom(workspaceAtom);
  const logo = workspace?.logo;

  useEffect(() => {
    if (!logo) return;

    const faviconUrl = getAvatarUrl(logo, AvatarIconType.WORKSPACE_ICON);
    if (!faviconUrl) return;

    // Static <link rel="icon"> tags from index.html must be removed —
    // having both static and dynamic icon links is ambiguous and most
    // browsers keep showing the original static favicon instead of
    // switching to the workspace logo.
    document
      .querySelectorAll<HTMLLinkElement>('link[rel="icon"]')
      .forEach((el) => {
        if (!el.hasAttribute(DYNAMIC_FAVICON_ATTR)) {
          el.remove();
        }
      });

    let link = document.querySelector<HTMLLinkElement>(
      `link[rel="icon"][${DYNAMIC_FAVICON_ATTR}]`,
    );
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute(DYNAMIC_FAVICON_ATTR, "true");
      document.head.appendChild(link);
    }
    link.href = faviconUrl;
  }, [logo]);

  return null;
}
