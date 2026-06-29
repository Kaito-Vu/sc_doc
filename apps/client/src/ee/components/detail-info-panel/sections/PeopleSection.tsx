import React from 'react';
import { Stack, Group, Avatar, Text, Box, Skeleton } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { SectionProps } from '../detail-info-panel.types';
import commonClasses from './common.module.css';
import classes from './PeopleSection.module.css';

const PeopleSectionComponent: React.FC<SectionProps> = ({ page, isLoading }) => {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Stack gap="sm">
        <Skeleton height={8} width="30%" />
        <Skeleton height={40} />
        <Skeleton height={40} />
      </Stack>
    );
  }

  return (
    <Stack gap="sm">
      <div className={commonClasses.title}>{t('PEOPLE')}</div>

      {/* Creator */}
      <div className={classes.creatorItem}>
        <Avatar
          name={page.creator?.name}
          size="sm"
          radius="md"
          color="blue"
        />
        <Box className={classes.creatorInfo}>
          <Text className={classes.creatorName}>{t('Creator')}</Text>
          <Text className={classes.creatorName}>
            {page.creator?.name || t('Unknown')}
          </Text>
        </Box>
      </div>

      {/* Last Updated By */}
      <div className={classes.creatorItem}>
        <Avatar
          name={page.lastUpdatedBy?.name}
          size="sm"
          radius="md"
          color="blue"
        />
        <Box className={classes.creatorInfo}>
          <Text className={classes.creatorName}>{t('Last updated by')}</Text>
          <Text className={classes.creatorName}>
            {page.lastUpdatedBy?.name || t('Unknown')}
          </Text>
        </Box>
      </div>
    </Stack>
  );
};

export const PeopleSection = React.memo(PeopleSectionComponent);
