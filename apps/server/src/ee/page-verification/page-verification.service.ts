import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PageVerificationRepo } from './page-verification.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { CommentRepo } from '@docmost/db/repos/comment/comment.repo';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import {
  Page,
  UpdatablePageVerification,
  User,
} from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeTx } from '@docmost/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { QueueJob, QueueName } from '../../integrations/queue/constants';
import {
  computeExpiresAt,
  resolveVerificationStatus,
} from './page-verification.status';
import {
  assertQmsTransition,
  canQmsTransition,
  REVIEW_STRATEGIES,
  ReviewDecision,
  ReviewDecisionStrategy,
} from './qms-workflow';


@Injectable()
export class PageVerificationService {
  constructor(
    private readonly pageVerificationRepo: PageVerificationRepo,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly commentRepo: CommentRepo,
    private readonly pageHistoryRepo: PageHistoryRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.NOTIFICATION_QUEUE)
    private readonly notificationQueue: Queue,
  ) {}

  private async getPageOrThrow(pageId: string) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private async getViewablePage(pageId: string, user: User) {
    const page = await this.getPageOrThrow(pageId);
    await this.pageAccessService.validateCanView(page, user);
    return page;
  }

  // Page-level edit rights (honours page restrictions; space-level
  // Manage(Page) alone would let space writers manage restricted pages they
  // cannot even open). The page creator keeps management while they can
  // still view the page.
  private async canManage(page: Page, user: User): Promise<boolean> {
    try {
      await this.pageAccessService.validateCanEdit(page, user, {
        ignoreLock: true,
      });
      return true;
    } catch {
      // fall through
    }
    if (page.creatorId !== user.id) return false;
    try {
      await this.pageAccessService.validateCanView(page, user);
      return true;
    } catch {
      return false;
    }
  }

  private async assertCanManage(page: Page, user: User): Promise<void> {
    if (!(await this.canManage(page, user))) {
      throw new ForbiddenException();
    }
  }

  // Verifiers must be active users of this workspace. Order is kept: the
  // first verifier is the primary one.
  private async assertWorkspaceVerifiers(
    verifierIds: string[],
    workspaceId: string,
  ): Promise<string[]> {
    const unique = [...new Set(verifierIds)];
    const valid = await this.pageVerificationRepo.findWorkspaceUserIds(
      unique,
      workspaceId,
    );
    if (valid.length !== unique.length) {
      throw new BadRequestException('Invalid verifier');
    }
    return unique;
  }

  private async buildInfo(pageId: string, user: User) {
    const page = await this.getViewablePage(pageId, user);

    const detail = await this.pageVerificationRepo.findDetailByPageId(page.id);
    if (!detail) {
      return { status: 'none' as const };
    }

    const [verifiers, isVerifier, canManage] = await Promise.all([
      this.pageVerificationRepo.getVerifiers(detail.id),
      this.pageVerificationRepo.isVerifier(detail.id, user.id),
      this.canManage(page, user),
    ]);
    const status = resolveVerificationStatus(detail);

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
          detail.type === 'qms' &&
          canQmsTransition(status, 'markObsolete') &&
          canManage,
      },
    };
  }

  async getInfo(pageId: string, user: User) {
    return this.buildInfo(pageId, user);
  }

  async setup(
    data: {
      pageId: string;
      type?: string;
      mode?: string;
      periodAmount?: number;
      periodUnit?: string;
      fixedExpiresAt?: string;
      verifierIds: string[];
    },
    user: User,
    workspaceId: string,
  ) {
    const page = await this.getPageOrThrow(data.pageId);
    await this.assertCanManage(page, user);

    const existing = await this.pageVerificationRepo.findByPageId(page.id);
    if (existing) {
      throw new BadRequestException('Verification already exists');
    }
    if (!data.verifierIds?.length) {
      throw new BadRequestException('At least one verifier is required');
    }
    const verifierIds = await this.assertWorkspaceVerifiers(
      data.verifierIds,
      workspaceId,
    );

    const type = data.type ?? 'expiring';
    const mode = data.mode ?? (type === 'qms' ? null : 'period');

    await executeTx(this.db, async (trx) => {
      const verification = await this.pageVerificationRepo.insert(
        {
          pageId: page.id,
          workspaceId,
          spaceId: page.spaceId,
          type,
          status: type === 'qms' ? 'draft' : null,
          mode,
          periodAmount: data.periodAmount ?? null,
          periodUnit: data.periodUnit ?? null,
          expiresAt:
            mode === 'fixed' && data.fixedExpiresAt
              ? new Date(data.fixedExpiresAt)
              : null,
          creatorId: user.id,
        },
        trx,
      );

      await this.pageVerificationRepo.replaceVerifiers(
        verification.id,
        verifierIds,
        user.id,
        trx,
      );
    });
  }

  async update(
    data: {
      pageId: string;
      mode?: string;
      periodAmount?: number;
      periodUnit?: string;
      fixedExpiresAt?: string;
      verifierIds?: string[];
    },
    user: User,
  ) {
    const page = await this.getPageOrThrow(data.pageId);
    // latest row: older QMS cycles are retained as audit rows (design §3.1)
    const verification = await this.pageVerificationRepo.findLatestByPageId(
      page.id,
    );
    if (!verification) {
      throw new NotFoundException('Verification not found');
    }
    await this.assertCanManage(page, user);
    const verifierIds = data.verifierIds
      ? await this.assertWorkspaceVerifiers(
          data.verifierIds,
          verification.workspaceId,
        )
      : undefined;

    const updates: Record<string, unknown> = {};
    if (data.mode !== undefined) updates.mode = data.mode;
    if (data.periodAmount !== undefined) updates.periodAmount = data.periodAmount;
    if (data.periodUnit !== undefined) updates.periodUnit = data.periodUnit;
    if (data.mode === 'fixed' && data.fixedExpiresAt) {
      updates.expiresAt = new Date(data.fixedExpiresAt);
    }

    await executeTx(this.db, async (trx) => {
      if (Object.keys(updates).length > 0) {
        await this.pageVerificationRepo.update(verification.id, updates, trx);
      }
      if (verifierIds) {
        await this.pageVerificationRepo.replaceVerifiers(
          verification.id,
          verifierIds,
          user.id,
          trx,
        );
      }
    });
  }

  async remove(pageId: string, user: User) {
    const page = await this.getPageOrThrow(pageId);
    await this.assertCanManage(page, user);
    await this.pageVerificationRepo.delete(page.id);
  }

  async verify(pageId: string, user: User) {
    const page = await this.getViewablePage(pageId, user);
    const verification = await this.pageVerificationRepo.findByPageId(page.id);
    if (!verification) {
      throw new NotFoundException('Verification not found');
    }

    const isVerifier = await this.pageVerificationRepo.isVerifier(
      verification.id,
      user.id,
    );
    if (!isVerifier) {
      throw new ForbiddenException();
    }

    const now = new Date();

    if (verification.type === 'qms') {
      // Superseded by the multi-reviewer state machine (design §2/§5):
      // this old single-reviewer flip set status='approved' directly,
      // without checking page_verification_reviews at all, so any single
      // verifier could one-click approve regardless of other reviewers'
      // pending decisions. QMS approval must go through approve()/reject()/
      // requestClarification() on the review page instead.
      throw new BadRequestException(
        'QMS pages require unanimous review approval; use the review page instead.',
      );
    }

    const expiresAt = computeExpiresAt({
      mode: verification.mode,
      periodAmount: verification.periodAmount,
      periodUnit: verification.periodUnit,
      from: now,
    });

    await this.pageVerificationRepo.update(verification.id, {
      verifiedAt: now,
      verifiedById: user.id,
      expiresAt,
      status: null,
    });
  }

  // Superseded by submit() (design §2/§5). Kept only so the endpoint returns
  // a clear error instead of 404ing outright for any stale client still
  // calling it: it is, and always was, QMS-only (the type guard below is
  // pre-existing), and unlike submit() it never gated on unresolved
  // comments, so leaving it live would let a caller bypass that requirement.
  async submitForApproval(pageId: string, user: User) {
    const verification = await this.pageVerificationRepo.findByPageId(pageId);
    if (!verification || verification.type !== 'qms') {
      throw new BadRequestException('QMS verification required');
    }
    throw new BadRequestException(
      'This action has been replaced by the review workflow; use "Send for Review" instead.',
    );
  }

  // Superseded by reject() (design §2/§5, Critical Finding 1). Kept only so
  // the endpoint returns a clear error instead of silently flipping status
  // to 'draft' without checking page_verification_reviews at all — any
  // single verifier could one-click reject and discard other verifiers'
  // pending/approved decisions for the cycle. Always QMS-only (pre-existing
  // guard below); QMS rejection must go through reject() on the review page.
  async rejectApproval(
    data: { pageId: string; comment?: string },
    user: User,
  ) {
    const verification = await this.pageVerificationRepo.findByPageId(
      data.pageId,
    );
    if (!verification || verification.type !== 'qms') {
      throw new NotFoundException('Verification not found');
    }
    throw new BadRequestException(
      'This action has been replaced by the review workflow; use the review page instead.',
    );
  }

  async markObsolete(pageId: string, user: User) {
    const page = await this.getPageOrThrow(pageId);
    // findLatestByPageId, not findByPageId: a page can carry a retained
    // `approved` audit row alongside a newer `draft` row once its content
    // has changed post-approval (design §3.1/§4); "obsolete" must apply to
    // the current/latest cycle, not a nondeterministically-picked one.
    const verification = await this.pageVerificationRepo.findLatestByPageId(
      page.id,
    );
    if (!verification || verification.type !== 'qms') {
      throw new NotFoundException('Verification not found');
    }
    await this.assertCanManage(page, user);
    assertQmsTransition(verification.status, 'markObsolete');

    await this.pageVerificationRepo.update(verification.id, {
      status: 'obsolete',
    });
  }

  async list(
    workspaceId: string,
    userId: string,
    pagination: PaginationOptions,
    filters: {
      spaceIds?: string[];
      verifierId?: string;
      type?: string;
    },
  ) {
    const accessibleSpaceIds =
      await this.spaceMemberRepo.getUserSpaceIds(userId);
    const result = await this.pageVerificationRepo.listVerifications(
      workspaceId,
      accessibleSpaceIds,
      pagination,
      filters,
    );

    // hide pages the user cannot open (page-level restrictions)
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: result.items.map((item) => item.pageId),
        userId,
      }),
    );

    return {
      ...result,
      items: result.items
        .filter((item) => accessible.has(item.pageId))
        .map((item) => ({
          ...item,
          status: resolveVerificationStatus({
            type: item.type,
            status: item.status,
            verifiedAt: item.verifiedAt,
            expiresAt: item.expiresAt,
          }),
          verifiedAt: item.verifiedAt
            ? new Date(item.verifiedAt).toISOString()
            : null,
          expiresAt: item.expiresAt
            ? new Date(item.expiresAt).toISOString()
            : null,
          createdAt: new Date(item.createdAt).toISOString(),
        })),
    };
  }

  async submit(pageId: string, user: User) {
    const page = await this.getPageOrThrow(pageId);
    // findLatestByPageId, not findByPageId: a page can have multiple
    // page_verification rows once a QMS cycle has gone through
    // approve -> content-changed-reset (see design doc §3.1/§4). Using
    // the unordered findByPageId here would pick a nondeterministic row.
    const verification = await this.pageVerificationRepo.findLatestByPageId(
      page.id,
    );
    if (!verification || verification.type !== 'qms') {
      throw new BadRequestException('QMS verification required');
    }
    await this.assertCanManage(page, user);
    assertQmsTransition(verification.status, 'submit');

    const unresolvedCount = await this.commentRepo.countUnresolvedByPageId(
      page.id,
    );
    if (unresolvedCount > 0) {
      throw new BadRequestException(
        `Resolve ${unresolvedCount} comment(s) before submitting for review`,
      );
    }

    const [lastHistory, verifiers] = await Promise.all([
      this.pageHistoryRepo.findPageLastHistory(page.id),
      this.pageVerificationRepo.getVerifiers(verification.id),
    ]);

    await executeTx(this.db, async (trx) => {
      // Scoped by verification.id, not pageId: a bare pageId-scoped update
      // would also flip any retained `approved` audit row for this page back
      // to `in_approval`, corrupting it (see design §3.1, Critical Finding 2).
      await this.pageVerificationRepo.update(
        verification.id,
        {
          status: 'in_approval',
          submittedAt: new Date(),
          pageHistoryId: lastHistory?.id ?? null,
          requestedAt: new Date(),
          requestedById: user.id,
          rejectedAt: null,
          rejectedById: null,
          rejectionComment: null,
          clarificationRequestedAt: null,
          clarificationRequestedById: null,
        },
        trx,
      );
      await this.pageVerificationRepo.resetReviewsForCycle(
        verification.id,
        verifiers.map((v) => v.id),
        trx,
      );
    });

    await this.notificationQueue.add(
      QueueJob.PAGE_APPROVAL_REQUESTED_NOTIFICATION,
      {
        pageId: page.id,
        spaceId: page.spaceId,
        workspaceId: verification.workspaceId,
        actorId: user.id,
        verifierIds: verifiers.map((v) => v.id),
      },
    );
  }

  async approve(pageId: string, user: User) {
    return this.decide(REVIEW_STRATEGIES.approve, pageId, user);
  }

  async reject(data: { pageId: string; comment: string }, user: User) {
    if (!data.comment?.trim()) {
      throw new BadRequestException('A rejection comment is required');
    }
    return this.decide(REVIEW_STRATEGIES.reject, data.pageId, user, data.comment);
  }

  async requestClarification(pageId: string, user: User) {
    return this.decide(REVIEW_STRATEGIES.requestClarification, pageId, user);
  }

  // One path for every verifier decision; the strategy supplies what differs
  // (comment gate, closing patch, whether all verifiers must have decided,
  // requester notification).
  private async decide(
    strategy: ReviewDecisionStrategy,
    pageId: string,
    user: User,
    comment?: string,
  ) {
    const verification = await this.getInApprovalVerificationForVerifier(
      pageId,
      user,
    );
    await this.assertCommentGate(
      verification.pageId,
      strategy.needsUnresolvedComment,
    );

    await executeTx(this.db, async (trx) => {
      await this.recordDecision(
        verification.id,
        user.id,
        strategy.decision,
        trx,
      );
      if (
        strategy.closesOnlyWhenAllDecided &&
        (await this.pageVerificationRepo.countPendingReviews(
          verification.id,
          trx,
        )) > 0
      ) {
        return;
      }
      await this.closeCycle(
        verification.id,
        strategy.closingPatch(user.id, comment),
        trx,
      );
    });

    if (strategy.notification) {
      await this.notificationQueue.add(strategy.notification, {
        pageId: verification.pageId,
        spaceId: verification.spaceId,
        workspaceId: verification.workspaceId,
        actorId: user.id,
        requestedById: verification.requestedById,
        ...(strategy.includeCommentInNotification && { comment }),
      });
    }
  }

  // Approve/reject need a clean comment slate; clarification needs an open
  // comment explaining what is unclear.
  private async assertCommentGate(pageId: string, needsUnresolved: boolean) {
    const unresolvedCount =
      await this.commentRepo.countUnresolvedByPageId(pageId);
    if (needsUnresolved && unresolvedCount === 0) {
      throw new BadRequestException(
        'Add an unresolved comment to request clarification',
      );
    }
    if (!needsUnresolved && unresolvedCount > 0) {
      throw new BadRequestException(
        'Resolve outstanding comments or request clarification instead',
      );
    }
  }

  // Locks the parent verification row first so concurrent decisions on the
  // same cycle serialize instead of racing on countPendingReviews (see the
  // write-skew note on lockForUpdate), then records this verifier's decision.
  private async recordDecision(
    verificationId: string,
    userId: string,
    decision: ReviewDecision,
    trx: KyselyTransaction,
  ) {
    await this.pageVerificationRepo.lockForUpdate(verificationId, trx);
    const decided = await this.pageVerificationRepo.recordReviewDecision(
      verificationId,
      userId,
      decision,
      trx,
    );
    if (!decided) {
      throw new ForbiddenException('No pending decision for this verifier');
    }
  }

  // Atomic race guard: 409 when another verifier already closed the cycle.
  private async closeCycle(
    verificationId: string,
    data: UpdatablePageVerification,
    trx: KyselyTransaction,
  ) {
    const flipped = await this.pageVerificationRepo.flipStatusIfInApproval(
      verificationId,
      data,
      trx,
    );
    if (!flipped) {
      throw new ConflictException('Review cycle already resolved');
    }
  }

  private async getInApprovalVerificationForVerifier(
    pageId: string,
    user: User,
  ) {
    const page = await this.getViewablePage(pageId, user);
    const verification = await this.pageVerificationRepo.findLatestByPageId(
      page.id,
    );
    if (!verification || verification.type !== 'qms') {
      throw new NotFoundException('Verification not found');
    }
    const isVerifier = await this.pageVerificationRepo.isVerifier(
      verification.id,
      user.id,
    );
    if (!isVerifier) {
      throw new ForbiddenException();
    }
    assertQmsTransition(verification.status, 'review');
    return verification;
  }

  async getReviewPayload(pageId: string, user: User) {
    const page = await this.getViewablePage(pageId, user);
    const verification = await this.pageVerificationRepo.findLatestByPageId(
      page.id,
    );
    if (!verification) {
      throw new NotFoundException('Verification not found');
    }
    const [reviews, isReviewer] = await Promise.all([
      this.pageVerificationRepo.findReviewsByVerificationId(verification.id),
      this.pageVerificationRepo.isVerifier(verification.id, user.id),
    ]);
    return {
      verification,
      reviews,
      permissions: { isReviewer },
    };
  }
}
