import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PageVerificationRepo } from './page-verification.repo';
import { loadLivePage } from '../common/load-page';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { Page, User } from '@docmost/db/types/entity.types';

// Plain class (not a Nest provider): existing specs register only
// PageVerificationService, so the service builds this from its own deps.
export class PageVerificationAccessPolicy {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly pageVerificationRepo: PageVerificationRepo,
  ) {}

  async getViewablePage(pageId: string, user: User) {
    const page = await loadLivePage(this.pageRepo, pageId, user.workspaceId);
    await this.pageAccessService.validateCanView(page, user);
    return page;
  }

  // Page-level edit rights (honours page restrictions; space-level
  // Manage(Page) alone would let space writers manage restricted pages they
  // cannot even open). The page creator keeps management while they can
  // still view the page.
  async canManage(page: Page, user: User): Promise<boolean> {
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

  async assertCanManage(page: Page, user: User): Promise<void> {
    if (!(await this.canManage(page, user))) {
      throw new ForbiddenException();
    }
  }

  // Verifiers must be active users of this workspace. Order is kept: the
  // first verifier is the primary one.
  async assertWorkspaceVerifiers(
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
}
