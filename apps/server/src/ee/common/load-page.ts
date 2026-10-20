import { NotFoundException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Page } from '@docmost/db/types/entity.types';

/** Loads a page, 404ing when it is missing, soft-deleted or in another workspace. */
export async function loadLivePage(
  pageRepo: Pick<PageRepo, 'findById'>,
  pageId: string,
  workspaceId: string,
  opts: {
    includeContent?: boolean;
    includeTextContent?: boolean;
    notFoundMessage?: string;
  } = {},
): Promise<Page> {
  const { notFoundMessage = 'Page not found', ...findOpts } = opts;
  const page = await pageRepo.findById(pageId, findOpts);
  if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
    throw new NotFoundException(notFoundMessage);
  }
  return page;
}
