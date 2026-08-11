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
    // Must explicitly reset the level's own counter back to its initial
    // value, not `revert` (which un-sets the author counter-reset entirely
    // rather than restarting the counter).
    expect(css).toContain(
      '.numbered-list[data-numbering-depth="1"].numbering-restart { counter-reset: numbering-level-1; }',
    );
    expect(css).not.toContain('counter-reset: revert');
  });

  it('suppresses the native browser marker on numbered lists', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    expect(css).toContain('.numbered-list { list-style: none; }');
  });

  it('does not reset the counter unconditionally per list instance (only on explicit restart)', () => {
    const css = buildCounterCss(DEFAULT_NUMBERING_SETTINGS);
    // Numbering should continue by default across separate list instances;
    // only `.numbering-restart` should reset a level's counter.
    expect(css).not.toContain(
      '.numbered-list[data-numbering-depth="1"] { counter-reset: numbering-level-1; }',
    );
  });
});
