import { Test } from '@nestjs/testing';
import { PageRepo } from './page.repo';
import { SpaceMemberRepo } from '../space/space-member.repo';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KYSELY_MODULE_CONNECTION_TOKEN } from 'nestjs-kysely';

describe('PageRepo.baseFields', () => {
  it('includes numberingSettings so findById/updatePage read and write it', async () => {
    const module = await Test.createTestingModule({
      providers: [
        PageRepo,
        { provide: SpaceMemberRepo, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: KYSELY_MODULE_CONNECTION_TOKEN(), useValue: {} },
      ],
    }).compile();

    const repo = module.get(PageRepo);
    expect((repo as any).baseFields).toContain('numberingSettings');
  });
});
