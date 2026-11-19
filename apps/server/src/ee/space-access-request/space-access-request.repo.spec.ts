import { SpaceAccessRequestRepo } from './space-access-request.repo';

function chain(result: unknown) {
  const c: any = {};
  for (const m of [
    'values', 'set', 'where', 'selectAll', 'select', 'returningAll',
    'forUpdate', 'orderBy', 'innerJoin',
  ]) c[m] = jest.fn().mockReturnValue(c);
  c.executeTakeFirst = jest.fn().mockResolvedValue(result);
  c.executeTakeFirstOrThrow = jest.fn().mockResolvedValue(result);
  c.execute = jest.fn().mockResolvedValue(undefined);
  return c;
}

describe('SpaceAccessRequestRepo', () => {
  it('insert writes to spaceAccessRequests with requested role', async () => {
    const c = chain({ id: 'r1' });
    const db: any = { insertInto: jest.fn().mockReturnValue(c) };
    const row = await new SpaceAccessRequestRepo(db).insert({
      workspaceId: 'w', spaceId: 's', requesterId: 'u', roleRequested: 'reader',
    });
    expect(db.insertInto).toHaveBeenCalledWith('spaceAccessRequests');
    expect(c.values).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 's', requesterId: 'u', roleRequested: 'reader', message: null }),
    );
    expect(row).toEqual({ id: 'r1' });
  });

  it('findPendingForSpaceAndUser filters status=pending', async () => {
    const c = chain(undefined);
    const db: any = { selectFrom: jest.fn().mockReturnValue(c) };
    await new SpaceAccessRequestRepo(db).findPendingForSpaceAndUser('s', 'u');
    expect(c.where).toHaveBeenCalledWith('status', '=', 'pending');
    expect(c.where).toHaveBeenCalledWith('requesterId', '=', 'u');
  });

  it('findByIdForUpdate locks the row inside the trx', async () => {
    const c = chain({ id: 'r1' });
    const trx: any = { selectFrom: jest.fn().mockReturnValue(c) };
    await new SpaceAccessRequestRepo({} as any).findByIdForUpdate('r1', trx);
    expect(c.forUpdate).toHaveBeenCalled();
  });

  it('decide sets status and decidedAt on the given id', async () => {
    const c = chain(undefined);
    const trx: any = { updateTable: jest.fn().mockReturnValue(c) };
    await new SpaceAccessRequestRepo({} as any).decide('r1', trx, {
      status: 'approved', reviewerId: 'a', roleGranted: 'writer',
    });
    expect(c.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', reviewerId: 'a', roleGranted: 'writer', decidedAt: expect.any(Date) }),
    );
    expect(c.where).toHaveBeenCalledWith('id', '=', 'r1');
  });

  it('countPending with an empty space list never emits an empty IN()', async () => {
    const c = chain({ count: '0' });
    const db: any = { selectFrom: jest.fn().mockReturnValue(c) };
    await new SpaceAccessRequestRepo(db).countPending('w', []);
    const call = c.where.mock.calls.find((x: any[]) => x[1] === 'in');
    expect(call[2].length).toBe(1);
  });
});
