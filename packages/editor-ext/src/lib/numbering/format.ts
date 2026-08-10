import { NumberingLevelFormat } from './types';

const CSS_COUNTER_STYLES: Record<NumberingLevelFormat, string> = {
  decimal: 'decimal',
  lowerRoman: 'lower-roman',
  upperRoman: 'upper-roman',
  lowerLetter: 'lower-alpha',
  upperLetter: 'upper-alpha',
  bullet: 'decimal', // unused when isBullet is true
};

export function resolveLevelFormat(format: NumberingLevelFormat): {
  cssCounterStyle: string;
  isBullet: boolean;
} {
  return {
    cssCounterStyle: CSS_COUNTER_STYLES[format],
    isBullet: format === 'bullet',
  };
}
