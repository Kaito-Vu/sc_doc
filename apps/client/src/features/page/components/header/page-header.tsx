import classes from "./page-header.module.css";
import PageHeaderMenu from "@/features/page/components/header/page-header-menu.tsx";
import { Group, ActionIcon, Tooltip } from "@mantine/core";
import { IconLayoutSidebarRight } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import Breadcrumb from "@/features/page/components/breadcrumbs/breadcrumb.tsx";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import React from "react";

interface Props {
  readOnly?: boolean;
  onToggleDetailPanel?: () => void;
  showDetailPanel?: boolean;
}
export default function PageHeader({ readOnly, onToggleDetailPanel, showDetailPanel }: Props) {
  const { t } = useTranslation();
  const hasDetailPanel = useHasFeature(Feature.DETAIL_INFO_PANEL);

  return (
    <div className={classes.header} data-page-header="true">
      <Group justify="space-between" h="100%" px="md" wrap="nowrap" className={classes.group}>
        <Breadcrumb />

        <Group justify="flex-end" h="100%" px="md" wrap="nowrap" gap="var(--mantine-spacing-xs)">
          {hasDetailPanel && onToggleDetailPanel && (
            <Tooltip label={showDetailPanel ? t("Hide details") : t("Show details")}>
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={onToggleDetailPanel}
                data-active={showDetailPanel}
                aria-label={showDetailPanel ? t("Hide details") : t("Show details")}
              >
                <IconLayoutSidebarRight size={18} />
              </ActionIcon>
            </Tooltip>
          )}
          <PageHeaderMenu readOnly={readOnly} />
        </Group>
      </Group>
    </div>
  );
}
