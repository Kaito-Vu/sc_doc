import { resolveLevelFormat } from './format';
import { NumberingSettings } from './types';

function levelContentExpression(
  text: string,
  resolveCounterName: (n: number) => string,
): string {
  // Split "%1.%2." into alternating literal/placeholder tokens and build a
  // CSS `content:` value: counter(...) calls for %N, quoted strings for literals.
  const tokens: string[] = [];
  const regex = /%(\d{1,2})|([^%]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    if (match[1]) {
      const level = Number(match[1]);
      tokens.push(`counter(${resolveCounterName(level)})`);
    } else if (match[2]) {
      tokens.push(`"${match[2].replace(/"/g, '\\"')}"`);
    }
  }
  return tokens.length > 0 ? tokens.join(' ') : '""';
}

function buildOrderedListRules(settings: NumberingSettings): string {
  const rules: string[] = [];
  const counterName = (n: number) => `numbering-level-${n}`;

  settings.levels.forEach((level, index) => {
    const levelNum = index + 1;
    const { cssCounterStyle, isBullet } = resolveLevelFormat(level.format);
    const selector = `.numbered-list[data-numbering-depth="${levelNum}"] > li`;

    const contentValue = isBullet
      ? `"${level.text.replace(/"/g, '\\"')}"`
      : levelContentExpression(level.text, (n) =>
          n === levelNum
            ? `${counterName(n)}, ${cssCounterStyle}`
            : `${counterName(n)}, decimal`,
        );

    rules.push(
      `.numbered-list[data-numbering-depth="${levelNum}"] { counter-reset: ${counterName(levelNum)}; }`,
    );
    rules.push(`${selector} { counter-increment: ${counterName(levelNum)}; }`);
    rules.push(`${selector}::before { content: ${contentValue}; }`);
  });

  rules.push('.numbered-list.numbering-restart { counter-reset: revert; }');

  return rules.join('\n');
}

function buildHeadingRules(settings: NumberingSettings): string {
  if (!settings.linkHeadingsToNumbering) return '';

  const rules: string[] = [];
  const counterName = (n: number) => `heading-level-${n}`;
  const resetChain = Array.from({ length: 10 }, (_, i) => counterName(i + 1)).join(' ');

  rules.push(`.editor-content { counter-reset: ${resetChain}; }`);

  settings.levels.forEach((level, index) => {
    const levelNum = index + 1;
    const { cssCounterStyle, isBullet } = resolveLevelFormat(level.format);
    const selector = `h${levelNum}.numbered-heading`;
    const deeperResets = Array.from({ length: 10 - levelNum }, (_, i) =>
      counterName(levelNum + i + 1),
    ).join(' ');

    const contentValue = isBullet
      ? `"${level.text.replace(/"/g, '\\"')}"`
      : levelContentExpression(level.text, (n) =>
          n === levelNum
            ? `${counterName(n)}, ${cssCounterStyle}`
            : `${counterName(n)}, decimal`,
        );

    rules.push(
      `${selector} { counter-increment: ${counterName(levelNum)};${deeperResets ? ` counter-reset: ${deeperResets};` : ''} }`,
    );
    rules.push(`${selector}::before { content: ${contentValue}; margin-right: 0.4em; }`);
    rules.push(
      `${selector}.numbering-restart { counter-reset: ${counterName(levelNum)}${deeperResets ? ' ' + deeperResets : ''}; }`,
    );
  });

  return rules.join('\n');
}

export function buildCounterCss(settings: NumberingSettings): string {
  if (!settings.enabled) return '';
  return [buildOrderedListRules(settings), buildHeadingRules(settings)]
    .filter(Boolean)
    .join('\n');
}
