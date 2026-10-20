export const DOC_CLASSIFICATIONS = [
  { value: "public", label: "Public" },
  { value: "internal", label: "Internal" },
  { value: "confidential", label: "Confidential" },
  { value: "restricted", label: "Restricted" },
] as const;

export type DocClassification = (typeof DOC_CLASSIFICATIONS)[number]["value"];

export type DocMetadataFilter =
  | "all"
  | "active"
  | "missing-owner"
  | "missing-classification"
  | "review-overdue"
  | "archived"
  | "in-review"
  | "approved"
  | "orphan"
  | "duplicate-titles";

export type DocUserRef = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type DocMetadata = {
  id: string;
  pageId: string;
  pageTitle: string | null;
  pageSlugId: string | null;
  pageIcon: string | null;
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  ownerId: string | null;
  owner: DocUserRef | null;
  reviewerId: string | null;
  reviewer: DocUserRef | null;
  classification: DocClassification | null;
  docType: string | null;
  effectiveAt: string | null;
  reviewDueAt: string | null;
  archivedAt: string | null;
  notes: string | null;
  verificationStatus: string | null;
  verificationExpiresAt: string | null;
  canEdit: boolean;
  updatedAt: string;
};

export type DocMetadataUpdate = {
  pageId: string;
  ownerId?: string | null;
  reviewerId?: string | null;
  classification?: DocClassification | null;
  docType?: string | null;
  effectiveAt?: string | null;
  reviewDueAt?: string | null;
  archivedAt?: string | null;
  notes?: string | null;
};

export type DocMetadataListParams = {
  spaceIds?: string[];
  filter?: DocMetadataFilter;
  classification?: DocClassification;
  docType?: string;
  query?: string;
  limit?: number;
  offset?: number;
};

export type DocMetadataHealth = {
  total: number;
  missingOwner: number;
  missingClassification: number;
  reviewOverdue: number;
  archived: number;
  inReview: number;
  orphan: number;
  duplicateTitles: number;
};
