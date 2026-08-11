import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NumberingService } from './numbering.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { DEFAULT_NUMBERING_SETTINGS } from '@docmost/editor-ext';

describe('NumberingService.updateSettings', () => {
  function buildModule(overrides: { pageRepo?: any; pageAccessService?: any } = {}) {
    return Test.createTestingModule({
      providers: [
        NumberingService,
        {
          provide: PageRepo,
          useValue: overrides.pageRepo ?? {
            findById: jest.fn().mockResolvedValue({ id: 'p1', deletedAt: null }),
            updatePage: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PageAccessService,
          useValue: overrides.pageAccessService ?? {
            validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }),
          },
        },
      ],
    }).compile();
  }

  it('rejects a settings payload without exactly 10 levels', async () => {
    const module = await buildModule();
    const service = module.get(NumberingService);

    const invalid = { ...DEFAULT_NUMBERING_SETTINGS, levels: DEFAULT_NUMBERING_SETTINGS.levels.slice(0, 3) };

    await expect(
      service.updateSettings('p1', invalid as any, { id: 'u1' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when the page does not exist', async () => {
    const module = await buildModule({
      pageRepo: { findById: jest.fn().mockResolvedValue(null), updatePage: jest.fn() },
    });
    const service = module.get(NumberingService);

    await expect(
      service.updateSettings('missing', DEFAULT_NUMBERING_SETTINGS, { id: 'u1' } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('validates edit access then persists the settings and returns them', async () => {
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'p1', deletedAt: null }),
      updatePage: jest.fn().mockResolvedValue(undefined),
    };
    const pageAccessService = { validateCanEdit: jest.fn().mockResolvedValue({ hasRestriction: false }) };
    const module = await buildModule({ pageRepo, pageAccessService });
    const service = module.get(NumberingService);
    const user = { id: 'u1' };

    const result = await service.updateSettings('p1', DEFAULT_NUMBERING_SETTINGS, user as any);

    expect(pageAccessService.validateCanEdit).toHaveBeenCalledWith(
      { id: 'p1', deletedAt: null },
      user,
    );
    expect(pageRepo.updatePage).toHaveBeenCalledWith(
      { numberingSettings: DEFAULT_NUMBERING_SETTINGS },
      'p1',
    );
    expect(result).toEqual(DEFAULT_NUMBERING_SETTINGS);
  });
});
