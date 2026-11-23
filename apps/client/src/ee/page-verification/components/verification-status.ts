import { VerificationStatus } from "@/ee/page-verification/types/page-verification.types";

// Badge color plus the Mantine shade used when the same color renders as text.
const STATUS_META: Record<VerificationStatus, { color: string; shade: number }> = {
  verified: { color: "blue", shade: 7 },
  approved: { color: "blue", shade: 7 },
  expiring: { color: "orange", shade: 8 },
  invalidated: { color: "orange", shade: 8 },
  in_approval: { color: "orange", shade: 8 },
  needs_clarification: { color: "orange", shade: 8 },
  expired: { color: "red", shade: 7 },
  obsolete: { color: "red", shade: 7 },
  draft: { color: "gray", shade: 6 },
  none: { color: "gray", shade: 6 },
};

const FALLBACK_META = STATUS_META.none;

export function getStatusBadgeColor(status: VerificationStatus): string {
  return (STATUS_META[status] ?? FALLBACK_META).color;
}

export function getStatusColor(status: VerificationStatus): string {
  const { color, shade } = STATUS_META[status] ?? FALLBACK_META;
  return `${color}.${shade}`;
}

export function getStatusCssColor(status: VerificationStatus): string {
  return `var(--mantine-color-${getStatusColor(status).replace(".", "-")})`;
}

export function getStatusLabel(
  status: VerificationStatus,
  t: (key: string) => string,
): string {
  switch (status) {
    case "verified":
      return t("Verified");
    case "expiring":
      return t("Review needed");
    case "expired":
      return t("Verification expired");
    case "invalidated":
      return t("Unverified changes");
    case "draft":
      return t("Draft");
    case "in_approval":
      return t("In Approval");
    case "needs_clarification":
      return t("Needs Clarification");
    case "approved":
      return t("Approved");
    case "obsolete":
      return t("Obsolete");
    default:
      return "";
  }
}
