import { useRef } from "react";
import { createPortal } from "react-dom";
import { useAtom, useStore } from "jotai";
import { useTranslation } from "react-i18next";
import { Menu } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileImport } from "@tabler/icons-react";
import bytes from "bytes";

import api from "@/lib/api-client";
import { IPage } from "@/features/page/types/page.types.ts";
import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import { spaceRoots, updateSpaceRoots } from "@/features/page/tree/utils/utils.ts";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";

const MAX_FILE_SIZE = bytes("30mb");

// Imports a single .md/.html/.docx/.pdf file as a child of `node`.
export function ImportSubPageMenuItem({ node }: { node: SpaceTreeNode }) {
  const { t } = useTranslation();
  const [, setData] = useAtom(treeDataAtom);
  const store = useStore();
  const emit = useQueryEmit();
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;

    if (files.some((f) => f.size > MAX_FILE_SIZE)) {
      notifications.show({
        color: "red",
        message: t("File exceeds the {{limit}} import limit", { limit: "30 MB" }),
      });
      return;
    }

    // ponytail: sequential uploads, parallelise only if big batches matter
    let imported = 0;
    for (const file of files) {
      try {
        const formData = new FormData();
        // text fields must precede the file: the server reads them off the file part
        formData.append("spaceId", node.spaceId);
        formData.append("parentPageId", node.id);
        formData.append("file", file);
        const { data: page } = await api.post<IPage>("/pages/import", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        addToTree(page);
        imported += 1;
      } catch (err: any) {
        notifications.show({
          color: "red",
          title: t("Failed to import pages"),
          message: err?.response?.data?.message ?? file.name,
        });
      }
    }
    if (imported) {
      notifications.show({ message: t("Your import is complete.") });
    }
  };

  const addToTree = (page: IPage) => {
    const child: SpaceTreeNode = {
      id: page.id,
      slugId: page.slugId,
      name: page.title,
      position: page.position,
      spaceId: page.spaceId,
      parentPageId: page.parentPageId,
      icon: page.icon,
      hasChildren: false,
      canEdit: true,
      children: [],
    };

    const parent = treeModel.find(
      spaceRoots(store.get(treeDataAtom), node.spaceId),
      node.id,
    ) as SpaceTreeNode | null;
    const flag = { hasChildren: true } as Partial<SpaceTreeNode>;

    // Children not lazy-loaded yet: only flag the chevron, the fetch on
    // expand will include the new page.
    if (parent?.hasChildren && !parent.children?.length) {
      setData((prev) =>
        updateSpaceRoots(prev, node.spaceId, (r) =>
          treeModel.update(r, node.id, flag),
        ),
      );
      return;
    }

    const index = parent?.children?.length ?? 0;
    setData((prev) =>
      updateSpaceRoots(prev, node.spaceId, (r) =>
        treeModel.update(treeModel.insert(r, node.id, child, index), node.id, flag),
      ),
    );
    setTimeout(() => {
      emit({
        operation: "addTreeNode",
        spaceId: node.spaceId,
        payload: { parentId: node.id, index, data: child },
      });
    }, 50);
  };

  return (
    <>
      <Menu.Item
        leftSection={<IconFileImport size={16} />}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        {t("Import as sub-page")}
      </Menu.Item>
      {/* portal: the dropdown unmounts on close, which would drop the change event */}
      {createPortal(
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept=".md,.html,.docx,.pdf"
          onChange={onPick}
          onClick={(e) => e.stopPropagation()}
        />,
        document.body,
      )}
    </>
  );
}
