import { resolveLevelFormat } from './format';

describe('resolveLevelFormat', () => {
  it('maps decimal to the CSS decimal counter style', () => {
    expect(resolveLevelFormat('decimal')).toEqual({
      cssCounterStyle: 'decimal',
      isBullet: false,
    });
  });

  it('maps roman formats to CSS lower/upper-roman', () => {
    expect(resolveLevelFormat('lowerRoman')).toEqual({
      cssCounterStyle: 'lower-roman',
      isBullet: false,
    });
    expect(resolveLevelFormat('upperRoman')).toEqual({
      cssCounterStyle: 'upper-roman',
      isBullet: false,
    });
  });

  it('maps letter formats to CSS lower/upper-alpha', () => {
    expect(resolveLevelFormat('lowerLetter')).toEqual({
      cssCounterStyle: 'lower-alpha',
      isBullet: false,
    });
    expect(resolveLevelFormat('upperLetter')).toEqual({
      cssCounterStyle: 'upper-alpha',
      isBullet: false,
    });
  });

  it('marks bullet as a literal glyph, not a counter style', () => {
    expect(resolveLevelFormat('bullet')).toEqual({
      cssCounterStyle: 'decimal',
      isBullet: true,
    });
  });
});
