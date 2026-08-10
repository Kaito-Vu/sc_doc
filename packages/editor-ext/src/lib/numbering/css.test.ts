import { buildCounterCss } from './css';
import { DEFAULT_NUMBERING_SETTINGS, NumberingSettings } from './types';

describe('buildCounterCss', () => {
  it('emits a counter-reset/counter-increment/content rule for level 1 ordered lists', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    expect(css).toContain('counter-reset: numbering-level-1');
    expect(css).toContain('counter-increment: numbering-level-1');
    expect(css).toContain('content: counter(numbering-level-1, decimal) "."');
  });

  it('emits a cumulative pattern for level 2 combining ancestor counters', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    // level 2 default pattern is "%1.%2." per DEFAULT_NUMBERING_SETTINGS
    expect(css).toContain(
      'content: counter(numbering-level-1, decimal) "." counter(numbering-level-2, decimal) "."',
    );
  });

  it('emits a literal bullet glyph instead of a counter() call for bullet levels', () => {
    const settings: NumberingSettings = {
      ...DEFAULT_NUMBERING_SETTINGS,
      levels: DEFAULT_NUMBERING_SETTINGS.levels.map((lvl, i) =>
        i === 0 ? { format: 'bullet' as const, text: '●' } : lvl,
      ) as NumberingSettings['levels'],
    };
    const css = buildCounterCss(settings);
    expect(css).toContain('content: "●"');
  });

  it('emits heading counter rules only for the 10 heading levels when headings enabled', () => {
    const settings: NumberingSettings = {
      ...DEFAULT_NUMBERING_SETTINGS,
      linkHeadingsToNumbering: true,
    };
    const css = buildCounterCss(settings);
    expect(css).toContain('heading-level-1');
    expect(css).toContain('h1.numbered-heading::before');
  });

  it('omits heading rules entirely when headings are not linked', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    expect(css).not.toContain('numbered-heading');
  });

  it('resets the counter at a restart node', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    expect(css).toContain('.numbering-restart');
  });
});
