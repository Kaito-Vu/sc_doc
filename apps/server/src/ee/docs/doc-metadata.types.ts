export const DOC_CLASSIFICATIONS = [
  'public',
  'internal',
  'confidential',
  'restricted',
] as const;

export type DocClassification = (typeof DOC_CLASSIFICATIONS)[number];

export const DOC_METADATA_FILTERS = [
  'all',
  'active',
  'missing-owner',
  'missing-classification',
  'review-overdue',
  'archived',
  'in-review',
  'approved',
  'orphan',
  'duplicate-titles',
] as const;

export type DocMetadataFilter = (typeof DOC_METADATA_FILTERS)[number];

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

export type DocMetadataRow = {
  id: string;
  page_id: string;
  workspace_id: string;
  space_id: string;
  owner_id: string | null;
  reviewer_id: string | null;
  classification: string | null;
  doc_type: string | null;
  effective_at: Date | null;
  review_due_at: Date | null;
  archived_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_avatar_url: string | null;
  reviewer_user_id: string | null;
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
  page_title: string | null;
  page_slug_id: string | null;
  page_icon: string | null;
  space_name: string;
  space_slug: string;
  verification_status: string | null;
  verification_expires_at: Date | null;
};
