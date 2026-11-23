import { mapDate, mapProperty, mapView, mapRow } from './base.mappers';

const d = new Date('2024-01-02T03:04:05.000Z');
const iso = '2024-01-02T03:04:05.000Z';

describe('base.mappers', () => {
  it('mapDate: Date to ISO, passthrough otherwise', () => {
    expect(mapDate(d)).toBe(iso);
    expect(mapDate('x')).toBe('x');
    expect(mapDate(null)).toBeNull();
    expect(mapDate(undefined)).toBeUndefined();
  });

  it('mapProperty picks fields, defaults typeOptions', () => {
    const out = mapProperty({
      id: 'i', pageId: 'p', name: 'n', type: 't', position: 'a',
      typeOptions: null, pendingType: 'pt', pendingTypeOptions: { a: 1 },
      isPrimary: true, workspaceId: 'w', createdAt: d, updatedAt: d, extra: 1,
    });
    expect(out).toEqual({
      id: 'i', pageId: 'p', name: 'n', type: 't', position: 'a',
      typeOptions: {}, pendingType: 'pt', pendingTypeOptions: { a: 1 },
      isPrimary: true, workspaceId: 'w', createdAt: iso, updatedAt: iso,
    });
  });

  it('mapView picks fields, defaults config', () => {
    expect(
      mapView({
        id: 'i', pageId: 'p', name: 'n', type: 't', config: null,
        position: 'a', workspaceId: 'w', creatorId: 'c',
        createdAt: d, updatedAt: null, extra: 1,
      }),
    ).toEqual({
      id: 'i', pageId: 'p', name: 'n', type: 't', config: {},
      position: 'a', workspaceId: 'w', creatorId: 'c',
      createdAt: iso, updatedAt: null,
    });
  });

  it('mapRow picks fields, defaults cells', () => {
    expect(
      mapRow({
        id: 'i', pageId: 'p', cells: undefined, position: 'a',
        creatorId: 'c', lastUpdatedById: 'l', workspaceId: 'w',
        createdAt: d, updatedAt: d, extra: 1,
      }),
    ).toEqual({
      id: 'i', pageId: 'p', cells: {}, position: 'a',
      creatorId: 'c', lastUpdatedById: 'l', workspaceId: 'w',
      createdAt: iso, updatedAt: iso,
    });
  });
});
