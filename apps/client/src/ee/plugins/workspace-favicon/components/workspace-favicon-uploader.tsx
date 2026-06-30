import { useState } from "react";
import { useAtom } from "jotai";
import { Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import AvatarUploader from "@/components/common/avatar-uploader";
import { uploadWorkspaceFavicon } from "../services/workspace-favicon-service";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import useUserRole from "@/hooks/use-user-role";
import { AvatarIconType } from "@/features/attachments/types/attachment.types";

export default function WorkspaceFaviconUploader() {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const { isAdmin } = useUserRole();

  const handleFaviconUpload = async (file: File) => {
    setIsLoading(true);
    try {
      const result = await uploadWorkspaceFavicon(file);
      if (workspace) {
        setWorkspace({ ...workspace, favicon: result.fileName });
      }
      notifications.show({
        message: t("Favicon uploaded successfully"),
        color: "green",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t("Failed to upload favicon");
      notifications.show({
        message: errorMessage,
        color: "red",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaviconRemove = async () => {
    // This plugin currently supports upload only.
    // AvatarUploader requires an `onRemove` prop, so we explicitly fail here
    // to show the built-in removal error notification.
    throw new Error(t("Remove favicon is not supported"));
  };

  return (
    <div style={{ marginBottom: "24px" }}>
      <Text size="sm" fw={500} mb="xs">
        {t("Favicon")}
      </Text>
      <Text size="xs" c="dimmed" mb="sm">
        {t("Favicon appears in browser tab (32x32 recommended)")}
      </Text>
      <AvatarUploader
        currentImageUrl={workspace?.favicon}
        fallbackName={workspace?.name}
        type={AvatarIconType.WORKSPACE_ICON}
        size="40px"
        radius="sm"
        variant="filled"
        onUpload={handleFaviconUpload}
        onRemove={handleFaviconRemove}
        isLoading={isLoading}
        disabled={!isAdmin}
      />
    </div>
  );
}
