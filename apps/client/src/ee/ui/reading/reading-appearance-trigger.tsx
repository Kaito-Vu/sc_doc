import { ActionIcon, Drawer, ScrollArea, Tooltip } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconTextSize } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ReadingAppearanceForm } from "./reading-appearance-form";

export function ReadingAppearanceTrigger() {
  const { t } = useTranslation();
  const [opened, { open, close }] = useDisclosure(false);
  const isMobile = useMediaQuery("(max-width: 48em)");

  return (
    <>
      <Tooltip label={t("Reading appearance")} openDelay={250} withArrow>
        <ActionIcon
          variant="subtle"
          color="gray"
          aria-label={t("Reading appearance")}
          onClick={open}
        >
          <IconTextSize size={20} stroke={1.5} />
        </ActionIcon>
      </Tooltip>

      <Drawer
        opened={opened}
        onClose={close}
        position={isMobile ? "bottom" : "right"}
        size={isMobile ? "88%" : 400}
        title={t("Reading appearance")}
        padding="lg"
        radius={isMobile ? "md" : 0}
        aria-label={t("Reading appearance")}
      >
        <ScrollArea.Autosize mah="calc(100dvh - 120px)" type="scroll">
          <ReadingAppearanceForm />
        </ScrollArea.Autosize>
      </Drawer>
    </>
  );
}
