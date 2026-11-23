type Detail = {
  id: string;
  pageId: string;
  type: string;
  mode: string | null;
  periodAmount: number | null;
  periodUnit: string | null;
  verifiedAt?: Date | null;
  verifiedBy?: unknown;
  expiresAt?: Date | null;
  requestedAt?: Date | null;
  requestedBy?: unknown;
  rejectedAt?: Date | null;
  rejectedBy?: unknown;
  rejectionComment: string | null;
};

type Verifier = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

export function mapVerificationInfo(
  detail: Detail,
  status: string,
  verifiers: Verifier[],
  isVerifier: boolean,
  canManage: boolean,
) {
  return {
    id: detail.id,
    pageId: detail.pageId,
    type: detail.type,
    mode: detail.mode,
    periodAmount: detail.periodAmount,
    periodUnit: detail.periodUnit,
    status,
    verifiedAt: detail.verifiedAt?.toISOString() ?? null,
    verifiedBy: detail.verifiedBy ?? null,
    expiresAt: detail.expiresAt?.toISOString() ?? null,
    requestedAt: detail.requestedAt?.toISOString() ?? null,
    requestedBy: detail.requestedBy ?? null,
    rejectedAt: detail.rejectedAt?.toISOString() ?? null,
    rejectedBy: detail.rejectedBy ?? null,
    rejectionComment: detail.rejectionComment,
    verifiers: verifiers.map((v) => ({
      id: v.id,
      name: v.name,
      email: v.email,
      avatarUrl: v.avatarUrl,
    })),
    permissions: {
      canVerify: isVerifier,
      canManage,
      canSubmitForApproval:
        detail.type === 'qms' && status === 'draft' && canManage,
      canMarkObsolete:
        detail.type === 'qms' && status === 'approved' && canManage,
    },
  };
}
