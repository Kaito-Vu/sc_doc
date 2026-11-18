import { PageEditSupplementListener } from './page-edit-supplement.listener';
import { QueueJob } from '../../../integrations/queue/constants';

const event = (over: any = {}) => ({
  pageId: 'p1',
  spaceId: 's1',
  workspaceId: 'w1',
  historyId: 'h1',
  contributorIds: ['u1'],
  title: 'T',
  hadPreviousContent: true,
  ...over,
});

describe('PageEditSupplementListener', () => {
  let queue: any;
  let listener: PageEditSupplementListener;

  beforeEach(() => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    listener = new PageEditSupplementListener(queue);
  });

  it('enqueues the supplement job with contributors and previous content', async () => {
    await listener.handle(event());
    expect(queue.add).toHaveBeenCalledWith(QueueJob.PAGE_EDIT_SUPPLEMENT, {
      pageId: 'p1',
      spaceId: 's1',
      workspaceId: 'w1',
      actorIds: ['u1'],
    });
  });

  it('skips without contributors', async () => {
    await listener.handle(event({ contributorIds: [] }));
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('skips for the first history row', async () => {
    await listener.handle(event({ hadPreviousContent: false }));
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('swallows queue failures', async () => {
    queue.add.mockRejectedValue(new Error('down'));
    await expect(listener.handle(event())).resolves.toBeUndefined();
  });
});
