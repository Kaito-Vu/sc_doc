import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { CollabAccessService } from '../../collaboration/services/collab-access.service';
import { isPageLockActive } from './page-lock.util';

@Injectable()
export class PageLockService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly collabAccess: CollabAccessService,
  ) {}

  private async findPage(pageId: string) {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt) throw new NotFoundException('Page not found');
    return page;
  }

  // Anyone who can edit may lock; validateCanEdit already rejects a page
  // that is actively locked by someone else.
  async lock(pageId: string, user: User) {
    const page = await this.findPage(pageId);
    await this.pageAccessService.validateCanEdit(page, user);

    await this.db
      .updateTable('pages')
      .set({ isLocked: true, lockedById: user.id, lockedAt: new Date() })
      .where('id', '=', page.id)
      .execute();

    await this.collabAccess.recheckAccess({ pageIds: [page.id] });
    return { isLocked: true, lockedById: user.id };
  }

  // The lock holder, or anyone with full control of the space (which
  // includes workspace owners/admins), may unlock.
  async unlock(pageId: string, user: User) {
    const page = await this.findPage(pageId);
    await this.pageAccessService.validateCanView(page, user);

    if (isPageLockActive(page) && page.lockedById !== user.id) {
      const ability = await this.spaceAbility.createForUser(user, page.spaceId);
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
        throw new ForbiddenException();
      }
    }

    await this.db
      .updateTable('pages')
      .set({ isLocked: false, lockedById: null, lockedAt: null })
      .where('id', '=', page.id)
      .execute();

    await this.collabAccess.recheckAccess({ pageIds: [page.id] });
    return { isLocked: false, lockedById: null };
  }
}
