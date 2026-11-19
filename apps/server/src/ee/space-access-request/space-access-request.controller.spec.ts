import { Test } from '@nestjs/testing';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SpaceAccessRequestController } from './space-access-request.controller';
import { SpaceAccessRequestService } from './space-access-request.service';
import {
  ApproveRequestDto,
  CreateRequestDto,
} from './dto/space-access-request.dto';

async function build(service: any) {
  const m = await Test.createTestingModule({
    controllers: [SpaceAccessRequestController],
    providers: [{ provide: SpaceAccessRequestService, useValue: service }],
  })
    .overrideGuard(JwtAuthGuard)
    .useValue({ canActivate: () => true })
    .compile();
  return m.get(SpaceAccessRequestController);
}

const UUID = '0190a1b2-0000-7000-8000-000000000000';

describe('SpaceAccessRequestController', () => {
  const user = { id: 'u1' } as any;

  it('info delegates with the slug', async () => {
    const service = { info: jest.fn().mockResolvedValue({ space: null }) };
    const c = await build(service);
    await c.info({ spaceSlug: 'x' }, user);
    expect(service.info).toHaveBeenCalledWith('x', user);
  });

  it('approve delegates id, role and user', async () => {
    const service = { approve: jest.fn().mockResolvedValue(undefined) };
    const c = await build(service);
    await c.approve({ id: 'r1', role: 'writer' } as any, user);
    expect(service.approve).toHaveBeenCalledWith('r1', 'writer', user);
  });

  it('count wraps the number', async () => {
    const c = await build({ count: jest.fn().mockResolvedValue(3) });
    expect(await c.count(user)).toEqual({ count: 3 });
  });

  it('create DTO rejects an invalid role', async () => {
    const dto = plainToInstance(CreateRequestDto, { spaceId: UUID, role: 'owner' });
    expect((await validate(dto)).some((e) => e.property === 'role')).toBe(true);
  });

  it('approve DTO accepts reader/writer/admin', async () => {
    for (const role of ['reader', 'writer', 'admin']) {
      const dto = plainToInstance(ApproveRequestDto, { id: UUID, role });
      expect(await validate(dto)).toHaveLength(0);
    }
  });
});
