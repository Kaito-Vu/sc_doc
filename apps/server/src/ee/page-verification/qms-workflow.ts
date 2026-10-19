import { BadRequestException } from '@nestjs/common';
import { UpdatablePageVerification } from '@docmost/db/types/entity.types';
import { QueueJob } from '../../integrations/queue/constants';

/**
 * QMS verification lifecycle (state pattern as data):
 *
 *   draft ──submit──▶ in_approval ──approve (all)──▶ approved ──▶ obsolete
 *     ▲                  │  │
 *     └──────reject──────┘  └──clarify──▶ needs_clarification ──submit──▶ in_approval
 *
 * Each state lists the actions it accepts; anything else is rejected with
 * the action's own message. Adding a state/transition is a one-line change.
 */
export type QmsStatus =
  | 'draft'
  | 'needs_clarification'
  | 'in_approval'
  | 'approved'
  | 'obsolete';

export type QmsAction = 'submit' | 'review' | 'markObsolete';

const ALLOWED_ACTIONS: Record<QmsStatus, readonly QmsAction[]> = {
  draft: ['submit'],
  needs_clarification: ['submit'],
  in_approval: ['review'],
  approved: ['markObsolete'],
  obsolete: [],
};

const REFUSAL_MESSAGE: Record<QmsAction, string> = {
  submit: 'Page is not eligible for submission',
  review: 'Page is not awaiting review',
  markObsolete: 'Only approved documents can be obsolete',
};

export function canQmsTransition(
  status: string | null,
  action: QmsAction,
): boolean {
  return (
    ALLOWED_ACTIONS[status as QmsStatus]?.includes(action) ?? false
  );
}

export function assertQmsTransition(
  status: string | null,
  action: QmsAction,
): void {
  if (!canQmsTransition(status, action)) {
    throw new BadRequestException(REFUSAL_MESSAGE[action]);
  }
}

export type ReviewDecision = 'approved' | 'rejected' | 'needs_clarification';

export interface ReviewDecisionStrategy {
  decision: ReviewDecision;
  /** clarification needs an open comment; approve/reject need none open. */
  needsUnresolvedComment: boolean;
  /** approve only closes the cycle once every verifier has approved. */
  closesOnlyWhenAllDecided: boolean;
  /** Patch applied when the cycle closes. */
  closingPatch(userId: string, comment?: string): UpdatablePageVerification;
  /** Notification for the requester, if any. */
  notification?: QueueJob;
  includeCommentInNotification?: boolean;
}

export const REVIEW_STRATEGIES = {
  approve: {
    decision: 'approved',
    needsUnresolvedComment: false,
    closesOnlyWhenAllDecided: true,
    closingPatch: (userId) => ({
      status: 'approved',
      verifiedAt: new Date(),
      verifiedById: userId,
    }),
  },
  reject: {
    decision: 'rejected',
    needsUnresolvedComment: false,
    closesOnlyWhenAllDecided: false,
    closingPatch: (userId, comment) => ({
      status: 'draft',
      rejectedAt: new Date(),
      rejectedById: userId,
      rejectionComment: comment,
    }),
    notification: QueueJob.PAGE_APPROVAL_REJECTED_NOTIFICATION,
    includeCommentInNotification: true,
  },
  requestClarification: {
    decision: 'needs_clarification',
    needsUnresolvedComment: true,
    closesOnlyWhenAllDecided: false,
    closingPatch: (userId) => ({
      status: 'needs_clarification',
      clarificationRequestedAt: new Date(),
      clarificationRequestedById: userId,
    }),
    notification: QueueJob.PAGE_APPROVAL_CLARIFICATION_NOTIFICATION,
  },
} satisfies Record<string, ReviewDecisionStrategy>;
