import React from 'react';
import { useParams } from 'react-router-dom';
import { usePageQuery } from '@/features/page/queries/page-query';
import { extractPageSlugId } from '@/lib';
import type { DetailInfoPanelProps } from './detail-info-panel.types';
import classes from './DetailInfoPanel.module.css';
import {
  ActionsSection,
  DangerZoneSection,
  DisplaySection,
  PeopleSection,
  ProtectionSection,
  StatsSection,
} from './sections';

const DetailInfoPanelComponent: React.FC<DetailInfoPanelProps> = (props) => {
  const { pageSlug } = useParams();
  const pageId = props.pageId ?? extractPageSlugId(pageSlug);
  const { data: page } = usePageQuery({ pageId });

  if (!page) return null;

  const section = { page, pageId };
  return (
    <div className={classes.root}>
      <PeopleSection {...section} />
      <StatsSection {...section} />
      <DisplaySection {...section} />
      <ProtectionSection {...section} />
      <ActionsSection {...section} />
      <DangerZoneSection {...section} />
    </div>
  );
};

export const DetailInfoPanel = React.memo(DetailInfoPanelComponent);

export default DetailInfoPanel;
