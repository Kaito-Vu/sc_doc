import {
  buildPageAttachmentDir,
  buildPageAttachmentPath,
} from './page-attachment-path';

describe('page attachment path', () => {
  it('nests ws/space/page/sub-page and flattens the file name', () => {
    const dir = buildPageAttachmentDir({
      workspaceId: 'w',
      spaceId: 's',
      pageChainIds: ['p', 'sub'],
    });
    expect(dir).toBe('w/s/p/sub');
    expect(buildPageAttachmentPath(dir, 'a1', 'x.png')).toBe('w/s/p/sub/a1-x.png');
  });

  it('caps depth but keeps the page itself', () => {
    const chain = Array.from({ length: 40 }, (_, i) => `p${i}`);
    const parts = buildPageAttachmentDir({
      workspaceId: 'w',
      spaceId: 's',
      pageChainIds: chain,
    }).split('/');
    expect(parts).toHaveLength(2 + 15);
    expect(parts[parts.length - 1]).toBe('p39');
  });
});
