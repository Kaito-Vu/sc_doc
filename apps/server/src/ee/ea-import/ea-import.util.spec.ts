import { eaRootSignature } from './ea-import.util';

describe('eaRootSignature', () => {
  it('joins root ids in a stable, order-independent way', () => {
    expect(eaRootSignature([{ id: 'B' }, { id: 'A' }])).toBe('A|B');
    expect(eaRootSignature([{ id: 'A' }, { id: 'B' }])).toBe('A|B');
  });

  it('filters out empty or missing ids', () => {
    expect(eaRootSignature([{ id: '' }, { id: 'A' }, { id: '' }])).toBe('A');
  });

  it('returns an empty string when there are no ids', () => {
    expect(eaRootSignature([])).toBe('');
    expect(eaRootSignature([{ id: '' }])).toBe('');
  });
});
