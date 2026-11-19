import { BadRequestException } from '@nestjs/common';
import { SpaceMemberService } from './space-member.service';

// Personal spaces belong to one person: nobody else can be added and roles
// cannot be changed.
function build(space: any) {
  const spaceRepo = { findById: jest.fn().mockResolvedValue(space) };
  const spaceMemberRepo = {
    insertSpaceMember: jest.fn(),
    updateSpaceMember: jest.fn(),
  };
  const db: any = { transaction: () => ({ execute: (cb: any) => cb({}) }) };
  const svc = new SpaceMemberService(
    spaceMemberRepo as any, {} as any, spaceRepo as any, {} as any, {} as any,
    db, { log: jest.fn() } as any, {} as any, {} as any, { emit: jest.fn() } as any,
  );
  return { svc, spaceMemberRepo };
}

describe('SpaceMemberService personal space guard', () => {
  const user = { id: 'u1' } as any;

  it('addMembersToSpaceBatch rejects a personal space', async () => {
    const { svc, spaceMemberRepo } = build({ id: 's1', isPersonal: true });
    await expect(
      svc.addMembersToSpaceBatch(
        { spaceId: 's1', userIds: ['u2'], groupIds: [], role: 'reader' } as any,
        user,
        'w1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(spaceMemberRepo.insertSpaceMember).not.toHaveBeenCalled();
  });

  it('updateSpaceMemberRole rejects a personal space', async () => {
    const { svc, spaceMemberRepo } = build({ id: 's1', isPersonal: true });
    await expect(
      svc.updateSpaceMemberRole(
        { spaceId: 's1', userId: 'u2', role: 'writer' } as any,
        'w1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(spaceMemberRepo.updateSpaceMember).not.toHaveBeenCalled();
  });
});
