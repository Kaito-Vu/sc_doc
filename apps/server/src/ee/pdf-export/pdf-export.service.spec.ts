import { Test } from '@nestjs/testing';
import { PdfExportService } from './pdf-export.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { TokenService } from '../../core/auth/services/token.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QueueName } from '../../integrations/queue/constants';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';
import { DEFAULT_NUMBERING_SETTINGS } from '@docmost/editor-ext';

describe('PdfExportService.getRenderPayload', () => {
  it('includes the page numberingSettings in the render payload', async () => {
    const tokenService = { verifyJwt: jest.fn().mockResolvedValue({ pageId: 'p1' }) };
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'p1',
        title: 'T',
        content: null,
        deletedAt: null,
        numberingSettings: DEFAULT_NUMBERING_SETTINGS,
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        PdfExportService,
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
        { provide: PageRepo, useValue: pageRepo },
        { provide: TokenService, useValue: tokenService },
        { provide: StorageService, useValue: {} },
        { provide: getQueueToken(QueueName.FILE_TASK_QUEUE), useValue: {} },
      ],
    }).compile();

    const service = module.get(PdfExportService);
    const payload = await service.getRenderPayload('p1', 'tok');

    expect(payload.numberingSettings).toEqual(DEFAULT_NUMBERING_SETTINGS);
  });
});
