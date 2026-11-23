import { mapVerificationInfo } from './page-verification.mapper';

const base = {
  id: 'pv1',
  pageId: 'p1',
  type: 'expiring',
  mode: 'period',
  periodAmount: 1,
  periodUnit: 'month',
  rejectionComment: null,
};
const v = [{ id: 'u1', name: 'A', email: 'a@x', avatarUrl: null, extra: 1 }];
const qms = { ...base, type: 'qms', mode: null };

describe('mapVerificationInfo', () => {
  it('periodic: dates serialized, qms permissions off', () => {
    const d = new Date('2026-01-01T00:00:00.000Z');
    const r = mapVerificationInfo(
      { ...base, verifiedAt: d, expiresAt: d, verifiedBy: 'u1' },
      'verified',
      v,
      true,
      true,
    );
    expect(r).toEqual({
      ...base,
      status: 'verified',
      verifiedAt: d.toISOString(),
      verifiedBy: 'u1',
      expiresAt: d.toISOString(),
      requestedAt: null,
      requestedBy: null,
      rejectedAt: null,
      rejectedBy: null,
      verifiers: [{ id: 'u1', name: 'A', email: 'a@x', avatarUrl: null }],
      permissions: {
        canVerify: true,
        canManage: true,
        canSubmitForApproval: false,
        canMarkObsolete: false,
      },
    });
  });

  it('qms draft + canManage allows submit only', () => {
    const r = mapVerificationInfo(qms, 'draft', [], false, true);
    expect(r.permissions).toEqual({
      canVerify: false,
      canManage: true,
      canSubmitForApproval: true,
      canMarkObsolete: false,
    });
    expect(r.verifiedAt).toBeNull();
  });

  it('qms approved + canManage allows obsolete only; no manage = none', () => {
    expect(mapVerificationInfo(qms, 'approved', [], false, true).permissions)
      .toMatchObject({ canSubmitForApproval: false, canMarkObsolete: true });
    expect(mapVerificationInfo(qms, 'approved', [], false, false).permissions)
      .toMatchObject({ canSubmitForApproval: false, canMarkObsolete: false });
  });

  it('qms obsolete / in_approval / rejected give no action permissions', () => {
    const d = {
      ...qms,
      rejectionComment: 'no',
      rejectedAt: new Date(0),
      rejectedBy: 'u2',
    };
    for (const s of ['obsolete', 'in_approval', 'rejected']) {
      const r = mapVerificationInfo(d, s, [], false, true);
      expect(r.permissions.canSubmitForApproval).toBe(false);
      expect(r.permissions.canMarkObsolete).toBe(false);
    }
    expect(mapVerificationInfo(d, 'rejected', [], false, true)).toMatchObject({
      rejectedAt: new Date(0).toISOString(),
      rejectedBy: 'u2',
      rejectionComment: 'no',
    });
  });

  it('periodic obsolete status never grants qms permissions', () => {
    expect(mapVerificationInfo(base, 'obsolete', [], false, true).permissions)
      .toMatchObject({ canSubmitForApproval: false, canMarkObsolete: false });
  });
});
