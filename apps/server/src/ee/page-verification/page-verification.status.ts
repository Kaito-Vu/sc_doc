export const EXPIRING_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

type PeriodUnit = 'day' | 'week' | 'month' | 'year';

export function computeExpiresAt(opts: {
  mode?: string | null;
  periodAmount?: number | null;
  periodUnit?: string | null;
  fixedExpiresAt?: string;
  from?: Date;
}): Date | null {
  const from = opts.from ?? new Date();
  if (opts.mode === 'indefinite') return null;
  if (opts.mode === 'fixed' && opts.fixedExpiresAt) {
    return new Date(opts.fixedExpiresAt);
  }
  if (opts.mode === 'period' && opts.periodAmount && opts.periodUnit) {
    const date = new Date(from);
    const amount = opts.periodAmount;
    const unit = opts.periodUnit as PeriodUnit;
    if (unit === 'day') date.setDate(date.getDate() + amount);
    else if (unit === 'week') date.setDate(date.getDate() + amount * 7);
    else if (unit === 'month') date.setMonth(date.getMonth() + amount);
    else if (unit === 'year') date.setFullYear(date.getFullYear() + amount);
    return date;
  }
  return null;
}

function computeExpiringStatus(verification: {
  verifiedAt: Date | null;
  expiresAt: Date | null;
  status: string | null;
}): string {
  if (verification.status === 'obsolete') return 'obsolete';
  if (!verification.verifiedAt) return 'draft';
  if (!verification.expiresAt) return 'verified';
  const now = Date.now();
  const expiresMs = new Date(verification.expiresAt).getTime();
  if (expiresMs <= now) return 'expired';
  if (expiresMs - now <= EXPIRING_WARNING_MS) return 'expiring';
  return 'verified';
}

export function resolveVerificationStatus(
  verification: {
    type: string;
    status: string | null;
    verifiedAt: Date | null;
    expiresAt: Date | null;
  } | null,
): string {
  if (!verification) return 'none';
  if (verification.type === 'qms') {
    return verification.status ?? 'draft';
  }
  return computeExpiringStatus(verification);
}
