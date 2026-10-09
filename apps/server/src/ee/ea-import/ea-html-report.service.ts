import { Inject, Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import * as tmp from 'tmp-promise';
import { v7 } from 'uuid';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { FileTask, InsertablePage } from '@docmost/db/types/entity.types';
import { executeTx } from '@docmost/db/utils';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { generateSlugId } from '../../common/helpers';
import { jsonToText } from '../../collaboration/collaboration.util';
import { EventName } from '../../common/events/event.contants';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { ImportService } from '../../integrations/import/services/import.service';
import { ImportAttachmentService } from '../../integrations/import/services/import-attachment.service';
import { buildAttachmentCandidates } from '../../integrations/import/utils/import.utils';
import { PageService } from '../../core/page/services/page.service';
import { inspectEaArchive } from './ea-asset.util';
import { fileStem, pickPageTitle, pickReportTitle } from './ea-html-report.util';
import { stripDuplicateLeadingHeading } from './ea-content.builder';
import { EaParseWarning } from './types/ea-import.types';

/**
 * Imports an Enterprise Architect **HTML report** (a ZIP of `.htm`/`.html`
 * pages plus images) into the target space. All pages land as children of a
 * single container page titled after the report.
 *
 * This is a minimal EE-side importer: it does not attempt to reconstruct the
 * EA package tree, it maps every report page to a Docmost page ordered by
 * `relativePath`.
 */

/**
 * Structurally identical to `EaImportResult` in `ea-import.service.ts`. It is
 * duplicated here to keep this service self-contained and avoid a circular
 * import between the two services.
 */
export interface EaHtmlReportResult {
  pageIds: string[];
  rootPageIds: string[];
  pageCount: number;
  warnings: EaParseWarning[];
}

const EMPTY_DOC = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [] }],
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Resolve `relativePath` inside `rootDir`, rejecting zip-slip entries that
 * would escape the temp directory.
 */
function safeJoin(rootDir: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const abs = path.resolve(rootDir, normalized);
  const rootResolved = path.resolve(rootDir);
  if (abs !== rootResolved && !abs.startsWith(rootResolved + path.sep)) {
    throw new Error(
      `Refusing to write EA report entry outside the temp directory: ${relativePath}`,
    );
  }
  return abs;
}

@Injectable()
export class EaHtmlReportService {
  private readonly logger = new Logger(EaHtmlReportService.name);

  constructor(
    private readonly importService: ImportService,
    private readonly pageService: PageService,
    private readonly importAttachmentService: ImportAttachmentService,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async importHtmlReport(opts: {
    buffer: Buffer;
    fileTask: FileTask;
    spaceId: string;
    workspaceId: string;
    creatorId: string;
  }): Promise<EaHtmlReportResult> {
    const { buffer, fileTask, spaceId, workspaceId, creatorId } = opts;

    const archive = await inspectEaArchive(buffer);
    if (archive.htmlPages.length === 0) {
      throw new Error('No HTML pages found in EA HTML report');
    }

    const pages = [...archive.htmlPages].sort((a, b) =>
      a.relativePath.localeCompare(b.relativePath),
    );

    const fileName = String(fileTask.fileName ?? '');
    const fallbackTitle =
      path.basename(fileName, path.extname(fileName)) || 'EA HTML Report';

    const indexPage = pages.find((page) =>
      /(^|\/)index\.html?$/i.test(page.relativePath),
    );
    const containerTitle = (
      pickReportTitle(indexPage?.html.toString('utf-8'), fallbackTitle) ||
      fallbackTitle
    ).normalize('NFC');

    const warnings: EaParseWarning[] = [];
    const { path: tmpDir, cleanup: cleanupTmpDir } = await tmp.dir({
      prefix: 'docmost-ea-html-',
      unsafeCleanup: true,
    });

    try {
      for (const page of pages) {
        const abs = safeJoin(tmpDir, page.relativePath);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, page.html);
      }
      for (const image of archive.htmlImages) {
        const abs = safeJoin(tmpDir, image.relativePath);
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, image.buffer);
      }

      const attachmentCandidates = await buildAttachmentCandidates(tmpDir);

      const prepared: Array<{
        id: string;
        title: string;
        content: any;
        ydoc: Buffer | null;
      }> = [];

      for (const page of pages) {
        const pageId = v7();
        const html = page.html.toString('utf-8');
        const fallback = fileStem(page.relativePath) || 'Untitled';
        const title = (pickPageTitle(html, fallback) || 'Untitled').normalize(
          'NFC',
        );

        try {
          const withAttachments =
            await this.importAttachmentService.processAttachments({
              html,
              pageRelativePath: page.relativePath,
              extractDir: tmpDir,
              pageId,
              fileTask,
              attachmentCandidates,
            });

          const prosemirrorJson =
            await this.importService.processHTML(withAttachments);
          const content = stripDuplicateLeadingHeading(prosemirrorJson, title);
          const ydoc = await this.importService.createYdoc(content);
          prepared.push({ id: pageId, title, content, ydoc });
        } catch (error) {
          warnings.push({
            page: title,
            reason: `Failed to convert page content: ${errorMessage(error)}`,
          });
          let ydoc: Buffer | null = null;
          try {
            ydoc = await this.importService.createYdoc(EMPTY_DOC);
          } catch {
            ydoc = null;
          }
          prepared.push({ id: pageId, title, content: EMPTY_DOC, ydoc });
        }
      }

      const containerId = v7();
      const containerYdoc = await this.importService.createYdoc(EMPTY_DOC);

      const pageIds: string[] = [];
      const rootPageIds: string[] = [];

      await executeTx(this.db, async (trx) => {
        const containerPosition = await this.pageService.nextPagePosition(
          spaceId,
          undefined,
          trx,
        );
        const container: InsertablePage = {
          id: containerId,
          slugId: generateSlugId(),
          title: containerTitle,
          content: EMPTY_DOC,
          textContent: jsonToText(EMPTY_DOC),
          ydoc: containerYdoc,
          position: containerPosition,
          spaceId,
          workspaceId,
          creatorId,
          lastUpdatedById: creatorId,
          parentPageId: null,
        };
        await trx.insertInto('pages').values(container).execute();
        pageIds.push(containerId);
        rootPageIds.push(containerId);

        for (const page of prepared) {
          const position = await this.pageService.nextPagePosition(
            spaceId,
            containerId,
            trx,
          );
          const insertable: InsertablePage = {
            id: page.id,
            slugId: generateSlugId(),
            title: page.title,
            content: page.content,
            textContent: jsonToText(page.content),
            ydoc: page.ydoc,
            position,
            spaceId,
            workspaceId,
            creatorId,
            lastUpdatedById: creatorId,
            parentPageId: containerId,
          };
          await trx.insertInto('pages').values(insertable).execute();
          pageIds.push(page.id);
        }
      });

      this.eventEmitter.emit(EventName.PAGE_CREATED, {
        pageIds,
        workspaceId,
      });

      await this.auditService.log({
        event: AuditEvent.PAGE_IMPORTED,
        resourceType: AuditResource.PAGE,
        resourceId: spaceId,
        spaceId,
        metadata: {
          source: 'ea-html',
          pageCount: pageIds.length,
        },
      });

      this.logger.log(
        `Imported ${pageIds.length} pages from EA HTML report (${warnings.length} warnings)`,
      );

      return {
        pageIds,
        rootPageIds,
        pageCount: pageIds.length,
        warnings,
      };
    } finally {
      try {
        await cleanupTmpDir();
      } catch (error) {
        this.logger.error('Failed to clean up EA HTML report temp dir', error);
      }
    }
  }
}
