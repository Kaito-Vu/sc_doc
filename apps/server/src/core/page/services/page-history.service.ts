import { Injectable, NotFoundException } from '@nestjs/common';
import { PageHistoryRepo } from '@docmost/db/repos/page/page-history.repo';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Page, PageHistory, User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { CursorPaginationResult } from '@docmost/db/pagination/cursor-pagination';
import { PageService } from './page.service';

@Injectable()
export class PageHistoryService {
  constructor(
    private pageHistoryRepo: PageHistoryRepo,
    private pageRepo: PageRepo,
    private pageService: PageService,
  ) {}

  async findById(historyId: string): Promise<PageHistory> {
    return await this.pageHistoryRepo.findById(historyId, {
      includeContent: true,
    });
  }

  async findHistoryByPageId(
    pageId: string,
    paginationOptions: PaginationOptions,
  ): Promise<CursorPaginationResult<PageHistory>> {
    return this.pageHistoryRepo.findPageHistoryByPageId(
      pageId,
      paginationOptions,
    );
  }

  async restore(historyId: string, user: User): Promise<Page> {
    const history = await this.pageHistoryRepo.findById(historyId, {
      includeContent: true,
    });
    if (!history) {
      throw new NotFoundException('Page history not found');
    }

    const page = await this.pageRepo.findById(history.pageId, {
      includeContent: true,
    });
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    // snapshot the live content before overwriting it, so the pre-restore
    // state is never lost even if it hasn't been auto-snapshotted yet
    await this.pageHistoryRepo.saveHistory(page);

    return this.pageService.update(
      page,
      {
        pageId: page.id,
        title: history.title,
        content: history.content as object,
        operation: 'replace',
        format: 'json',
      },
      user,
    );
  }
}
