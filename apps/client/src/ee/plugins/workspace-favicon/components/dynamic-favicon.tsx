import { useAtom } from "jotai";
import { Helmet } from "react-helmet-async";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { getAvatarUrl } from "@/lib/config";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";

export default function DynamicFavicon() {
  const [workspace] = useAtom(workspaceAtom);
  const favicon = workspace?.favicon;

  if (!favicon) {
    return null;
  }

  const faviconUrl = getAvatarUrl(favicon, AvatarIconType.WORKSPACE_ICON);

  return (
    <Helmet>
      <link rel="icon" type="image/png" href={faviconUrl} />
    </Helmet>
  );
}
