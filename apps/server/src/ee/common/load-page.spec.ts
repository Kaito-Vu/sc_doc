import { NotFoundException } from '@nestjs/common';
import { loadLivePage } from './load-page';

const repo = (page: any) => ({ findById: jest.fn().mockResolvedValue(page) });

describe('loadLivePage', () => {
  it('returns a live page of the workspace', async () => {
    const page = { id: 'p', workspaceId: 'w', deletedAt: null };
    const r = repo(page);
    await expect(
      loadLivePage(r as any, 'p', 'w', { includeContent: true }),
    ).resolves.toBe(page);
    expect(r.findById).toHaveBeenCalledWith('p', { includeContent: true });
  });

  it.each([
    ['missing', null],
    ['deleted', { workspaceId: 'w', deletedAt: new Date() }],
    ['other workspace', { workspaceId: 'x', deletedAt: null }],
  ])('throws NotFound when %s', async (_n, page) => {
    await expect(
      loadLivePage(repo(page) as any, 'p', 'w', { notFoundMessage: 'Nope' }),
    ).rejects.toThrow(new NotFoundException('Nope'));
  });
});
