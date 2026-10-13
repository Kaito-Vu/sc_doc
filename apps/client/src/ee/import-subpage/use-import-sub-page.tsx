import { useRef } from "react";
import { atom, useAtom, useSetAtom } from "jotai";
import { Menu } from "@mantine/core";
import { IconFileImport } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import PageImportModal from "@/features/page/components/page-import-modal.tsx";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";

const importTargetAtom = atom<{ spaceId: string; parentPageId: string } | null>(
  null,
);

/** "Import as sub-page" item for a tree node's menu. */
export function useImportSubPage(node: SpaceTreeNode) {
  const { t } = useTranslation();
  const setTarget = useSetAtom(importTargetAtom);

  const menuItem = (
    <Menu.Item
      leftSection={<IconFileImport size={16} />}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setTarget({ spaceId: node.spaceId, parentPageId: node.id });
      }}
    >
      {t("Import as sub-page")}
    </Menu.Item>
  );

  return { menuItem };
}

/**
 * Single shared import modal, mounted once (a per-node modal would mount one
 * per tree row, and unmounting would kill in-flight ZIP import polling).
 */
export function ImportSubPageHost() {
  const [target, setTarget] = useAtom(importTargetAtom);
  // Sticky: import handlers (and ZIP polling) keep using the last target after
  // the modal closes.
  const last = useRef(target);
  if (target) last.current = target;
  return (
    <PageImportModal
      spaceId={last.current?.spaceId ?? ""}
      parentPageId={last.current?.parentPageId}
      open={!!target}
      onClose={() => setTarget(null)}
    />
  );
}
