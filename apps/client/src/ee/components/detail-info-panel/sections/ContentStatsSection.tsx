import React, { useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { countWords } from 'alfaaz';
import type { Editor } from '@tiptap/react';
import type { Mark } from '@tiptap/pm/model';
import { useTranslation } from 'react-i18next';
import { pageEditorAtom } from '@/features/editor/atoms/editor-atoms';
import classes from '../DetailInfoPanel.module.css';

const WORDS_PER_MINUTE = 200;
const REFRESH_MS = 400;

type ContentStats = {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
  headings: number;
  images: number;
  tables: number;
  links: number;
};

function computeStats(editor: Editor): ContentStats {
  const { doc } = editor.state;
  const text = doc.textBetween(0, doc.content.size, '\n', ' ');
  const stats: ContentStats = {
    words: countWords(text),
    characters: text.replace(/\n/g, '').length,
    charactersNoSpaces: text.replace(/\s/g, '').length,
    paragraphs: 0,
    headings: 0,
    images: 0,
    tables: 0,
    links: 0,
  };
  // Adjacent text nodes sharing one link mark (e.g. bold + plain parts) are one link.
  let prevLink: Mark | null = null;
  doc.descendants((node) => {
    if (!node.isText) prevLink = null;
    switch (node.type.name) {
      case 'paragraph':
        if (node.content.size > 0) stats.paragraphs++;
        break;
      case 'heading':
        stats.headings++;
        break;
      case 'image':
        stats.images++;
        break;
      case 'table':
        stats.tables++;
        break;
      default:
        if (node.isText) {
          const link = node.marks.find((m) => m.type.name === 'link') ?? null;
          if (link && !prevLink?.eq(link)) stats.links++;
          prevLink = link;
        }
    }
  });
  return stats;
}

// Recomputed from the live editor document, debounced so typing stays cheap.
function useContentStats(editor: Editor | null): ContentStats | null {
  const [stats, setStats] = useState<ContentStats | null>(null);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    setStats(computeStats(editor));
    let timer: ReturnType<typeof setTimeout>;
    const onUpdate = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!editor.isDestroyed) setStats(computeStats(editor));
      }, REFRESH_MS);
    };
    editor.on('update', onUpdate);
    return () => {
      clearTimeout(timer);
      editor.off('update', onUpdate);
    };
  }, [editor]);

  return stats;
}

const ContentStatsSectionComponent: React.FC = () => {
  const { t } = useTranslation();
  const editor = useAtomValue(pageEditorAtom);
  const stats = useContentStats(editor);

  const fmt = (n?: number) => (stats && n !== undefined ? n.toLocaleString() : '—');
  const readMinutes = stats
    ? stats.words === 0
      ? 0
      : Math.max(1, Math.ceil(stats.words / WORDS_PER_MINUTE))
    : undefined;

  const tiles: { label: string; value: string; primary?: boolean }[] = [
    { label: t('Words'), value: fmt(stats?.words), primary: true },
    { label: t('Characters'), value: fmt(stats?.characters), primary: true },
    {
      label: t('Reading time'),
      value: readMinutes === undefined ? '—' : `${readMinutes} ${t('min')}`,
      primary: true,
    },
    { label: t('Characters (no spaces)'), value: fmt(stats?.charactersNoSpaces) },
    { label: t('Paragraphs'), value: fmt(stats?.paragraphs) },
    { label: t('Headings'), value: fmt(stats?.headings) },
    { label: t('Images'), value: fmt(stats?.images) },
    { label: t('Tables'), value: fmt(stats?.tables) },
    { label: t('Links'), value: fmt(stats?.links) },
  ];

  return (
    <>
      <p className={classes.sectionLabel}>{t('Content')}</p>
      <div className={classes.tileGrid}>
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className={`${classes.tile} ${tile.primary ? classes.tilePrimary : ''}`}
          >
            <span className={classes.tileValue}>{tile.value}</span>
            <span className={classes.tileLabel}>{tile.label}</span>
          </div>
        ))}
      </div>
    </>
  );
};

export const ContentStatsSection = React.memo(ContentStatsSectionComponent);
