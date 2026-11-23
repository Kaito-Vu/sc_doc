import { Logger } from '@nestjs/common';
import { PageLabelInheritListener } from './page-label-inherit.listener';

describe('PageLabelInheritListener', () => {
  const make = (copy = jest.fn().mockResolvedValue(undefined)) => ({
    copy,
    l: new PageLabelInheritListener({ copyParentLabels: copy } as any),
  });

  it('delegates page ids to the repo', async () => {
    const { l, copy } = make();
    await l.handlePageCreated({ pageIds: ['a'] });
    expect(copy).toHaveBeenCalledWith(['a']);
  });

  it('no-ops on empty / missing ids', async () => {
    const { l, copy } = make();
    await l.handlePageCreated({ pageIds: [] });
    await l.handlePageCreated(undefined as any);
    expect(copy).not.toHaveBeenCalled();
  });

  it('swallows repo errors with a warning', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { l } = make(jest.fn().mockRejectedValue(new Error('boom')));
    await expect(
      l.handlePageCreated({ pageIds: ['a'] }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Label inheritance failed: boom');
    warn.mockRestore();
  });
});
