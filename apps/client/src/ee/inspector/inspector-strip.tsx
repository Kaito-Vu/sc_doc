import { ActionIcon, Tooltip } from "@mantine/core";
import {
  IconInfoCircle,
  IconList,
  IconMessage,
  IconSparkles,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { ASIDE_PANEL_ID, useAsideTriggerProps } from "@/hooks/use-toggle-aside";
import { usePageQuery } from "@/features/page/queries/page-query";
import { extractPageSlugId } from "@/lib";
import { useHasFeature } from "@/ee/hooks/use-feature";
import { Feature } from "@/ee/features";
import { isModernUi } from "@/ee/modern-ui";
import classes from "./inspector-strip.module.css";

function StripButton({
  tab,
  label,
  icon,
}: {
  tab: string;
  label: string;
  icon: React.ReactNode;
}) {
  const { isAsideOpen, tab: active } = useAtomValue(asideStateAtom);
  const trigger = useAsideTriggerProps(tab);
  const isActive = isAsideOpen && active === tab;
  return (
    <Tooltip label={label} position="left" openDelay={250} withArrow>
      <ActionIcon
        variant={isActive ? "light" : "subtle"}
        color={isActive ? "blue" : "gray"}
        size="lg"
        aria-label={label}
        data-inspector-tab={tab}
        {...trigger}
      >
        {icon}
      </ActionIcon>
    </Tooltip>
  );
}

/**
 * Right-edge switcher for the aside panel tabs (one place instead of icons
 * spread across the page header). Modern UI only; the header duplicates are
 * hidden by sc-skin.css.
 */
export function InspectorStrip() {
  const { t } = useTranslation();
  const onPage = useLocation().pathname.includes("/p/");
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  const hasDetailInfo = useHasFeature(Feature.DETAIL_INFO_PANEL);
  const aiChat = useAtomValue(workspaceAtom)?.settings?.ai?.chat === true;

  if (!onPage || !isModernUi()) return null;

  return (
    <nav
      className={classes.strip}
      aria-label={t("Page panels")}
      aria-controls={ASIDE_PANEL_ID}
    >
      <StripButton tab="comments" label={t("Comments")} icon={<IconMessage size={20} />} />
      {!page?.isBase && (
        <StripButton tab="toc" label={t("Table of contents")} icon={<IconList size={20} />} />
      )}
      {hasDetailInfo && !page?.isBase && (
        <StripButton tab="detail-info" label={t("Detail Info")} icon={<IconInfoCircle size={20} />} />
      )}
      {aiChat && (
        <StripButton tab="chat" label={t("AI Chat")} icon={<IconSparkles size={20} />} />
      )}
    </nav>
  );
}
