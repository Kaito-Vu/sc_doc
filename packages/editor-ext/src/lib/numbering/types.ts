export type NumberingLevelFormat =
  | 'decimal'
  | 'lowerRoman'
  | 'upperRoman'
  | 'lowerLetter'
  | 'upperLetter'
  | 'bullet';

export interface NumberingLevelConfig {
  format: NumberingLevelFormat;
  // Word-style pattern using %1.."%10 placeholders referencing the counter
  // value at that ancestor level, e.g. "%1.%2." -> "1.1.", "(%3)" -> "(a)".
  // For "bullet" format, `text` is the literal bullet glyph (e.g. "●") and
  // %N placeholders are not applicable.
  text: string;
}

export type NumberingLevels = [
  NumberingLevelConfig, NumberingLevelConfig, NumberingLevelConfig,
  NumberingLevelConfig, NumberingLevelConfig, NumberingLevelConfig,
  NumberingLevelConfig, NumberingLevelConfig, NumberingLevelConfig,
  NumberingLevelConfig,
];

export interface NumberingSettings {
  enabled: boolean;
  linkHeadingsToNumbering: boolean;
  levels: NumberingLevels;
}

export const DEFAULT_NUMBERING_SETTINGS: NumberingSettings = {
  enabled: true,
  linkHeadingsToNumbering: false,
  levels: Array.from({ length: 10 }, (_, i) => ({
    format: 'decimal' as const,
    text: Array.from({ length: i + 1 }, (_, j) => `%${j + 1}.`).join(''),
  })) as NumberingLevels,
};
