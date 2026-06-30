import { useAtom } from "jotai";
import { Helmet } from "react-helmet-async";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { getAvatarUrl } from "@/lib/config";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";

export default function DynamicFavicon() {
  const [workspace] = useAtom(workspaceAtom);
  const logo = workspace?.logo;

  if (!logo) {
    return null;
  }

  const faviconUrl = getAvatarUrl(logo, AvatarIconType.WORKSPACE_ICON);

  return (
    <Helmet>
      <link rel="icon" href={faviconUrl} />
    </Helmet>
  );
}
