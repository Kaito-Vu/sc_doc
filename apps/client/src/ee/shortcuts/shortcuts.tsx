import { Kbd, Modal, Table, Text } from "@mantine/core";
import { useDisclosure, useHotkeys } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { platformModifierLabel } from "@/lib";

/** Alt+N creates a page in the current space (only where the user may). */
export function useSpaceShortcuts(onCreate: () => void, enabled: boolean) {
  useHotkeys([["alt+N", () => enabled && onCreate()]]);
}

/** Mod+/ opens a cheat sheet of the app's keyboard shortcuts. */
export function ShortcutsHelp() {
  const { t } = useTranslation();
  const [opened, { toggle, close }] = useDisclosure(false);
  useHotkeys([["mod+/", toggle]]);

  const rows: [string, string][] = [
    [`${platformModifierLabel} + K`, t("Search")],
    [`${platformModifierLabel} + Shift + P`, t("Command palette")],
    [`${platformModifierLabel} + F`, t("Find in page")],
    ["Alt + N", t("Create page")],
    [`${platformModifierLabel} + /`, t("Keyboard shortcuts")],
  ];

  return (
    <Modal opened={opened} onClose={close} title={t("Keyboard shortcuts")} centered>
      <Table>
        <Table.Tbody>
          {rows.map(([keys, label]) => (
            <Table.Tr key={label}>
              <Table.Td>
                <Text size="sm">{label}</Text>
              </Table.Td>
              <Table.Td ta="right">
                <Kbd>{keys}</Kbd>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Modal>
  );
}
