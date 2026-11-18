import { BadRequestException, ConflictException } from '@nestjs/common';
import { AnnouncementService } from './announcement.service';
import {
  classifyOverlaps,
  deriveStatus,
  extractText,
  isSafeHref,
  isVisibleAt,
  validateContent,
} from './announcement.utils';

const d = (s: string) => new Date(s);
const doc = (text: string, marks?: any[]) => ({
  type: 'doc',
  content: [
    { type: 'paragraph', content: [{ type: 'text', text, ...(marks ? { marks } : {}) }] },
  ],
});

describe('announcement utils', () => {
  const now = d('2026-01-10T00:00:00Z');

  it('derives status', () => {
    const base = { archivedAt: null, startsAt: d('2026-01-01T00:00:00Z'), endsAt: null };
    expect(deriveStatus(base, now)).toBe('active');
    expect(deriveStatus({ ...base, startsAt: d('2026-02-01T00:00:00Z') }, now)).toBe('scheduled');
    expect(deriveStatus({ ...base, archivedAt: now }, now)).toBe('archived');
    expect(deriveStatus({ ...base, endsAt: d('2026-01-10T00:00:00Z') }, now)).toBe('archived');
    expect(isVisibleAt({ ...base, endsAt: d('2026-01-11T00:00:00Z') }, now)).toBe(true);
  });

  it('extracts text and validates content', () => {
    expect(extractText(doc('hello'))).toBe('hello');
    expect(extractText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
    expect(validateContent(doc('hi', [{ type: 'bold' }, { type: 'link', attrs: { href: 'https://a.b' } }]))).toBe('hi');
    expect(() => validateContent(doc('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]))).toThrow(BadRequestException);
    expect(() => validateContent(doc('x', [{ type: 'code' }]))).toThrow(BadRequestException);
    expect(() => validateContent({ type: 'doc', content: [] })).toThrow(BadRequestException);
  });

  it('checks hrefs', () => {
    expect(isSafeHref('/page')).toBe(true);
    expect(isSafeHref('//evil.com')).toBe(false);
    expect(isSafeHref('mailto:a@b.c')).toBe(true);
    expect(isSafeHref('data:text/html,x')).toBe(false);
  });

  it('classifies overlaps by start time', () => {
    const cand = { startsAt: d('2026-02-01T00:00:00Z'), endsAt: null };
    const mk = (id: string, s: string) => ({ id, title: id, startsAt: d(s), endsAt: null });
    const r = classifyOverlaps(cand, [
      mk('early', '2026-01-01T00:00:00Z'),
      mk('late', '2026-03-01T00:00:00Z'),
      mk('same', '2026-02-01T00:00:00Z'),
    ]);
    expect(r.replaces.map((x) => x.id)).toEqual(['early']);
    expect(r.replacedBy).toEqual([{ id: 'late', title: 'late', at: '2026-03-01T00:00:00.000Z' }]);
    expect(r.clashes.map((x) => x.id)).toEqual(['same']);
  });
});

describe('AnnouncementService', () => {
  let repo: any;
  let service: AnnouncementService;
  let audit: { log: jest.Mock };
  const row = (over: any = {}) => ({
    id: 'a1', title: 'T', type: 'info', color: 'blue', content: doc('hi'),
    isDismissible: false, audience: 'members', textContent: 'hi',
    startsAt: d('2026-01-01T00:00:00Z'), endsAt: null, archivedAt: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  });
  const input = (over: any = {}) => ({
    title: ' T ', type: 'info', color: 'blue', content: doc('hi'),
    isDismissible: false, audience: 'members', startsAt: null, endsAt: null, ...over,
  });

  beforeEach(() => {
    repo = {
      findVisible: jest.fn().mockResolvedValue([]),
      findOverlapping: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      insert: jest.fn().mockImplementation(async (v) => row(v)),
      update: jest.fn().mockImplementation(async (_i, _w, v) => row(v)),
    };
    audit = { log: jest.fn() };
    const db = { transaction: () => ({ execute: (cb: any) => cb({}) }) };
    service = new AnnouncementService(
      repo,
      { findById: jest.fn().mockResolvedValue({ licenseKey: '', plan: 'x' }) } as any,
      { hasFeature: jest.fn().mockReturnValue(true) } as any,
      db as any,
      audit as any,
    );
  });

  it('visible: caps to 1 and includes public flag only for public', async () => {
    repo.findVisible.mockResolvedValue([row()]);
    const v = await service.getVisible('w');
    expect(repo.findVisible).toHaveBeenCalledWith('w', expect.any(Date), 1, false);
    expect(v.items).toHaveLength(1);
    expect(v.items[0]).not.toHaveProperty('audience');
    await service.getPublic('w');
    expect(repo.findVisible).toHaveBeenLastCalledWith('w', expect.any(Date), 1, true);
  });

  it('public: empty without workspace id or feature', async () => {
    expect((await service.getPublic(undefined)).items).toEqual([]);
    (service as any).licenseCheckService.hasFeature.mockReturnValue(false);
    expect((await service.getPublic('w')).items).toEqual([]);
    expect(repo.findVisible).not.toHaveBeenCalled();
  });

  it('create: trims title, derives text, audits', async () => {
    const r = await service.create('w', 'u', input() as any);
    expect(repo.insert.mock.calls[0][0]).toMatchObject({ title: 'T', textContent: 'hi', workspaceId: 'w', creatorId: 'u' });
    expect(r.status).toBe('active');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ event: 'announcement.created' }));
  });

  it('create: rejects past end, end before start, long text', async () => {
    await expect(service.create('w', 'u', input({ endsAt: '2020-01-01T00:00:00Z' }) as any)).rejects.toThrow(BadRequestException);
    await expect(service.create('w', 'u', input({ startsAt: '2099-01-02T00:00:00Z', endsAt: '2099-01-01T00:00:00Z' }) as any)).rejects.toThrow(BadRequestException);
    await expect(service.create('w', 'u', input({ content: doc('x'.repeat(501)) }) as any)).rejects.toThrow(BadRequestException);
  });

  it('create: overlap answers 409 with replaces unless replace=true', async () => {
    repo.findOverlapping.mockResolvedValue([row({ id: 'old' })]);
    const err: any = await service.create('w', 'u', input() as any).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().replaces[0].id).toBe('old');
    expect(repo.insert).not.toHaveBeenCalled();

    await service.create('w', 'u', input({ replace: true }) as any);
    expect(repo.update).toHaveBeenCalledWith('old', 'w', expect.objectContaining({ endsAt: expect.any(Date) }), expect.anything());
    expect(repo.insert).toHaveBeenCalled();
  });

  it('create: replace pulls own end back to the next start', async () => {
    const later = d('2099-03-01T00:00:00Z');
    repo.findOverlapping.mockResolvedValue([row({ id: 'next', startsAt: later })]);
    await service.create('w', 'u', input({ startsAt: '2099-01-01T00:00:00Z', replace: true }) as any);
    expect(repo.insert.mock.calls[0][0].endsAt).toEqual(later);
  });

  it('create: equal start is a hard conflict even with replace', async () => {
    const s = '2099-01-01T00:00:00Z';
    repo.findOverlapping.mockResolvedValue([row({ id: 'same', startsAt: d(s) })]);
    const err: any = await service.create('w', 'u', input({ startsAt: s, replace: true }) as any).catch((e) => e);
    expect(err.getResponse().conflict.announcements[0].id).toBe('same');
  });

  it('unarchive: refuses ended, conflicts on overlap, otherwise clears archivedAt', async () => {
    repo.findById.mockResolvedValue(row({ archivedAt: new Date(), endsAt: d('2020-01-01T00:00:00Z') }));
    await expect(service.unarchive('w', 'u', 'a1')).rejects.toThrow(BadRequestException);

    repo.findById.mockResolvedValue(row({ archivedAt: new Date() }));
    repo.findOverlapping.mockResolvedValue([row({ id: 'o' })]);
    await expect(service.unarchive('w', 'u', 'a1')).rejects.toThrow(ConflictException);

    repo.findOverlapping.mockResolvedValue([]);
    await service.unarchive('w', 'u', 'a1');
    expect(repo.update.mock.calls.at(-1)[2]).toMatchObject({ archivedAt: null });
  });
});
