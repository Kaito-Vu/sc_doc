import React from 'react';
import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconArrowRight, IconDownload, IconHistory, IconPrinter } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useSetAtom } from 'jotai';
import { historyAtoms } from '@/features/page-history/atoms/history-atoms';
import MovePageModal from '@/features/page/components/move-page-modal';
import ExportModal from '@/components/common/export-modal';
import HistoryModal from '@/features/page-history/components/history-modal';
import type { SectionProps } from '../detail-info-panel.types';
import classes from '../DetailInfoPanel.module.css';

const ActionsSectionComponent: React.FC<SectionProps> = ({ page, pageId }) => {
  const { t } = useTranslation();
  const setHistoryOpen = useSetAtom(historyAtoms);
  const [moveOpened, { open: openMove, close: closeMove }] = useDisclosure(false);
  const [exportOpened, { open: openExport, close: closeExport }] = useDisclosure(false);

  const actions = [
    { label: t('Move'), icon: IconArrowRight, onClick: openMove },
    { label: t('History'), icon: IconHistory, onClick: () => setHistoryOpen(true) },
    { label: t('Export'), icon: IconDownload, onClick: openExport },
    { label: t('Print'), icon: IconPrinter, onClick: () => globalThis.print() },
  ];

  return (
    <>
      <p className={classes.sectionLabel}>{t('Actions')}</p>
      <div className={classes.actionsGrid}>
        {actions.map(({ label, icon: Icon, onClick }) => (
          <Button
            key={label}
            variant="default"
            size="xs"
            leftSection={<Icon size={13} />}
            className={classes.actionBtn}
            fullWidth
            onClick={onClick}
          >
            {label}
          </Button>
        ))}
      </div>

      <HistoryModal pageId={pageId} pageTitle={page.title} />
      <MovePageModal
        open={moveOpened}
        onClose={closeMove}
        pageId={pageId}
        slugId={page.slugId}
        currentSpaceSlug={page.space?.slug ?? ''}
      />
      <ExportModal
        id={pageId}
        type="page"
        open={exportOpened}
        onClose={closeExport}
      />
    </>
  );
};

export const ActionsSection = React.memo(ActionsSectionComponent);
