import { PageHistoryRecorderService } from '../services/page-history-recorder.service';
import { EventName } from '../../common/events/event.contants';
import { QueueJob } from '../../integrations/queue/constants';

describe('PageHistoryRecorderService fork hooks', () => {
  it('emits PAGE_CONTENT_UPDATED after saving a new history row', async () => {
    const savedHistory = { id: 'hist-1' };
    const page = {
      id: 'p1',
      spaceId: 's1',
      workspaceId: 'w1',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }] },
    };
    const pageHistoryRepo = {
      findPageLastHistory: jest
        .fn()
        .mockResolvedValue({
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
        }),
      saveHistory: jest.fn().mockResolvedValue(savedHistory),
    };
    const pageRepo = { findById: jest.fn().mockResolvedValue(page) };
    const collabHistory = {
      popContributors: jest.fn().mockResolvedValue([]),
      addContributors: jest.fn(),
      clearContributors: jest.fn(),
    };
    const watcherService = { addPageWatchers: jest.fn() };
    const notificationQueue = { add: jest.fn() };
    const generalQueue = {
      add: jest.fn().mockReturnValue({ catch: jest.fn() }),
    };
    const eventEmitter = { emit: jest.fn() };
    const processor: any = new PageHistoryRecorderService(
      pageHistoryRepo as any,
      pageRepo as any,
      collabHistory as any,
      watcherService as any,
      notificationQueue as any,
      generalQueue as any,
      eventEmitter as any,
    );

    await processor.recordPageHistory('p1');

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EventName.PAGE_CONTENT_UPDATED,
      {
        pageId: 'p1',
        spaceId: 's1',
        workspaceId: 'w1',
        historyId: 'hist-1',
        actorIds: [],
      },
    );
  });

  it('queues the page update job and emits PAGE_HISTORY_RECORDED for ee listeners', async () => {
    const page = {
      id: 'p1',
      spaceId: 's1',
      workspaceId: 'w1',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'new' }] }] },
    };
    const pageHistoryRepo = {
      findPageLastHistory: jest
        .fn()
        .mockResolvedValue({
          content: { type: 'doc', content: [{ type: 'paragraph' }] },
        }),
      saveHistory: jest.fn().mockResolvedValue({ id: 'hist-1' }),
    };
    const pageRepo = { findById: jest.fn().mockResolvedValue(page) };
    const collabHistory = {
      popContributors: jest.fn().mockResolvedValue(['u1']),
      addContributors: jest.fn(),
      clearContributors: jest.fn(),
    };
    const watcherService = { addPageWatchers: jest.fn() };
    const notificationQueue = { add: jest.fn().mockResolvedValue(undefined) };
    const generalQueue = {
      add: jest.fn().mockReturnValue({ catch: jest.fn() }),
    };
    const eventEmitter = { emit: jest.fn() };
    const processor: any = new PageHistoryRecorderService(
      pageHistoryRepo as any,
      pageRepo as any,
      collabHistory as any,
      watcherService as any,
      notificationQueue as any,
      generalQueue as any,
      eventEmitter as any,
    );

    await processor.recordPageHistory('p1');

    const expectedPayload = expect.objectContaining({
      pageId: 'p1',
      spaceId: 's1',
      workspaceId: 'w1',
      actorIds: ['u1'],
    });
    expect(notificationQueue.add).toHaveBeenCalledWith(
      QueueJob.PAGE_UPDATED,
      expectedPayload,
    );
    expect(notificationQueue.add).not.toHaveBeenCalledWith(
      QueueJob.PAGE_EDIT_SUPPLEMENT,
      expect.anything(),
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EventName.PAGE_HISTORY_RECORDED,
      {
        pageId: 'p1',
        spaceId: 's1',
        workspaceId: 'w1',
        historyId: 'hist-1',
        contributorIds: ['u1'],
        title: null,
        hadPreviousContent: true,
      },
    );
  });
});
