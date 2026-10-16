import { Menu } from "@mantine/core";
import { IconArrowBackUp } from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { queryClient } from "@/main";
import { getApiErrorMessage } from "@/lib/api-error";
import { IPage } from "@/features/page/types/page.types";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom";
import { treeModel } from "@/features/page/tree/model/tree-model";
import { SpaceTreeNode } from "@/features/page/tree/types";
import { socketAtom } from "@/features/websocket/atoms/socket-atom";
import { revertBaseToPage } from "@/ee/base/services/base-service";

type Props = { page: IPage };

export default function RevertBaseMenuItem({ page }: Props) {
  const { t } = useTranslation();
  const [, setTreeData] = useAtom(treeDataAtom);
  const [socket] = useAtom(socketAtom);

  const mutation = useMutation<void, Error, void>({
    mutationFn: () => revertBaseToPage(page.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pages"] });
      queryClient.invalidateQueries({ queryKey: ["sidebar-pages"] });
      queryClient.invalidateQueries({
        queryKey: ["root-sidebar-pages", page.spaceId],
      });
      queryClient.removeQueries({ queryKey: ["bases", page.id] });
      setTreeData((prev) =>
        treeModel.update(prev, page.id, {
          isBase: false,
        } as Partial<SpaceTreeNode>),
      );
      socket?.emit("message", {
        operation: "updateOne",
        spaceId: page.spaceId,
        entity: ["pages"],
        id: page.id,
        payload: { isBase: false, slugId: page.slugId },
      });
    },
    onError: (error) => {
      notifications.show({
        message: getApiErrorMessage(error, t("Failed to revert to page")),
        color: "red",
      });
    },
  });

  return (
    <Menu.Item
      leftSection={<IconArrowBackUp size={16} />}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate()}
    >
      {t("Revert to normal page")}
    </Menu.Item>
  );
}
