import { ScimProvisioningService } from './scim-provisioning.service';

describe('ScimProvisioningService.createUser', () => {
  const trx = { trx: true };
  const db: any = { transaction: () => ({ execute: (cb: any) => cb(trx) }) };
  const userRepo: any = {
    findByEmail: jest.fn().mockResolvedValue(undefined),
    insertUser: jest.fn().mockResolvedValue({ id: 'u1', email: 'a@b.c' }),
  };
  const groupUserRepo: any = { addUserToDefaultGroup: jest.fn() };
  const workspaceService: any = {
    addUserToWorkspace: jest.fn(),
    deactivateUser: jest.fn(),
    activateUser: jest.fn(),
    deleteUser: jest.fn(),
  };
  const groupRepo: any = { findByName: jest.fn().mockResolvedValue(undefined) };
  const groupService: any = { deleteGroup: jest.fn() };
  const svc = new ScimProvisioningService(
    db,
    userRepo,
    groupRepo,
    groupUserRepo,
    workspaceService,
    groupService,
  );

  it('applies default role and default group like SSO/signup, in one trx', async () => {
    const res = await svc.createUser('w1', { userName: 'a@b.c' });
    expect(userRepo.insertUser).toHaveBeenCalledWith(expect.anything(), trx);
    expect(workspaceService.addUserToWorkspace).toHaveBeenCalledWith(
      'u1',
      'w1',
      undefined,
      trx,
    );
    expect(groupUserRepo.addUserToDefaultGroup).toHaveBeenCalledWith(
      'u1',
      'w1',
      trx,
    );
    expect(res.id).toBe('u1');
  });

  it('is idempotent for an existing email', async () => {
    userRepo.findByEmail.mockResolvedValueOnce({ id: 'u2', email: 'a@b.c' });
    userRepo.insertUser.mockClear();
    await svc.createUser('w1', { userName: 'a@b.c' });
    expect(userRepo.insertUser).not.toHaveBeenCalled();
  });
});

describe('ScimProvisioningService lifecycle parity with core', () => {
  const userRepo: any = {
    findById: jest.fn(),
    findByEmail: jest.fn().mockResolvedValue(undefined),
    updateUser: jest.fn(),
  };
  const groupRepo: any = { findByName: jest.fn() };
  const workspaceService: any = {
    deactivateUser: jest.fn(),
    activateUser: jest.fn(),
    deleteUser: jest.fn(),
  };
  const groupService: any = { deleteGroup: jest.fn() };
  const svc = new ScimProvisioningService(
    {} as any,
    userRepo,
    groupRepo,
    {} as any,
    workspaceService,
    groupService,
  );
  const active = { id: 'u1', email: 'a@b.c', name: 'A', deactivatedAt: null };

  beforeEach(() => {
    jest.clearAllMocks();
    userRepo.findByEmail.mockResolvedValue(undefined);
    jest.spyOn(svc, 'getUser').mockResolvedValue({} as any);
  });

  it('deactivates through core when active=false', async () => {
    userRepo.findById.mockResolvedValue(active);
    await svc.replaceUser('w1', 'u1', { active: false });
    expect(workspaceService.deactivateUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      'u1',
      'w1',
    );
  });

  it('does not reactivate a deactivated user when active is omitted', async () => {
    userRepo.findById.mockResolvedValue({ ...active, deactivatedAt: new Date() });
    await svc.replaceUser('w1', 'u1', { name: { formatted: 'New' } });
    expect(workspaceService.activateUser).not.toHaveBeenCalled();
    expect(userRepo.updateUser.mock.calls[0][0]).not.toHaveProperty(
      'deactivatedAt',
    );
  });

  it('reactivates through core when active=true', async () => {
    userRepo.findById.mockResolvedValue({ ...active, deactivatedAt: new Date() });
    await svc.replaceUser('w1', 'u1', { active: true });
    expect(workspaceService.activateUser).toHaveBeenCalled();
  });

  it('rejects an email already used by another user and lowercases new ones', async () => {
    userRepo.findById.mockResolvedValue(active);
    userRepo.findByEmail.mockResolvedValueOnce({ id: 'other' });
    await expect(
      svc.replaceUser('w1', 'u1', { userName: 'X@B.C' }),
    ).rejects.toThrow('Email is already in use');

    await svc.replaceUser('w1', 'u1', { userName: 'New@B.C' });
    expect(userRepo.updateUser.mock.calls[0][0].email).toBe('new@b.c');
  });

  it('deletes users and groups through core', async () => {
    userRepo.findById.mockResolvedValue(active);
    await svc.deleteUser('w1', 'u1');
    expect(workspaceService.deleteUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' }),
      'u1',
      'w1',
    );
    await svc.deleteGroup('w1', 'g1');
    expect(groupService.deleteGroup).toHaveBeenCalledWith('g1', 'w1');
  });

  it('refuses duplicate group names', async () => {
    groupRepo.findByName.mockResolvedValue({ id: 'g' });
    await expect(svc.createGroup('w1', { displayName: 'Eng' })).rejects.toThrow(
      'already exists',
    );
  });
});
