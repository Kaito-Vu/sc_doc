import { KyselyDB } from '@docmost/db/types/kysely.types';
import { getAttachmentFolderPath } from '../../core/attachment/attachment.utils';
import { AttachmentType } from '../../core/attachment/attachment.constants';
import {
  buildPageAttachmentPath,
  getPageAttachmentDir,
} from './page-attachment-path';

/** Page files go to the page tree; template/other files keep the legacy path. */
export async function getUploadFilePath(
  db: KyselyDB,
  scope: { pageId?: string; spaceId: string; workspaceId: string },
  attachmentId: string,
  fileName: string,
): Promise<string> {
  if (!scope.pageId) {
    return `${getAttachmentFolderPath(AttachmentType.File, scope.workspaceId)}/${attachmentId}/${fileName}`;
  }
  const dir = await getPageAttachmentDir(db, {
    id: scope.pageId,
    spaceId: scope.spaceId,
    workspaceId: scope.workspaceId,
  });
  return buildPageAttachmentPath(dir, attachmentId, fileName);
}
