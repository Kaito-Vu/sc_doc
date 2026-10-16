import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { FileTask, InsertablePage } from '@docmost/db/types/entity.types';
import { v7 } from 'uuid';
import { sql } from 'kysely';
import * as path from 'path';
import { Readable } from 'stream';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  createByteCountingStream,
  generateSlugId,
  sanitizeFileName,
} from '../../common/helpers';
import { jsonToText } from '../../collaboration/collaboration.util';
import { EventName } from '../../common/events/event.contants';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { ImportService } from '../../integrations/import/services/import.service';
import { PageService } from '../../core/page/services/page.service';
import {
  FileTaskStatus,
  FileTaskType,
  getFileTaskFolderPath,
} from '../../integrations/import/utils/file.utils';
import { StorageService } from '../../integrations/storage/storage.service';
import { generateJitteredKeyBetween } from 'fractional-indexing-jittered';
import { runEaCpuJobs } from './ea-cpu.pool';
import {
  EaDiagram,
  EaImageAsset,
  EaPackageNode,
  EaParseWarning,
  EaParseResult,
  EaRtfImage,
} from './types/ea-import.types';
import {
  buildContainerHtml,
  buildDiagramHtml,
  buildFlowHtml,
  readModelDocumentUncompressedSize,
  stripDuplicateLeadingHeading,
  stripEaCodePrefix,
} from './ea-content.builder';
import { convertModelDocuments } from './ea-convert.pool';
import {
  EaArchiveInspection,
  inspectEaArchive,
  isZipBuffer,
  normalizeAssetKey,
  resolveImageForDiagram,
} from './ea-asset.util';
import { EaAttachmentService } from './ea-attachment.service';
import { EaHtmlReportService } from './ea-html-report.service';
import { eaRtfImagePlaceholder } from './rtf-to-html';
import { buildWireframeDrawioSvg, drawioNodeHtml } from './ea-wireframe';
import {
  EA_IMPORT_JOB,
  EA_IMPORT_QUEUE,
  EA_STATUS_CANCELED,
} from './ea-import.constants';
import {
  eaNodeHasContent,
  eaRootSignature,
  flattenEaNodes,
  isLegacyStubText,
  textHash,
} from './ea-import.util';

const EA_SOURCE = 'ea';

/** Duplicate-import resolution chosen by the user in the client dialog. */
export type EaImportMode = 'replace' | 'keep' | 'merge';

const IMAGE_UPLOAD_CONCURRENCY = 4;
const INSERT_BATCH = 20;
/** Parse on a worker thread above this size; smaller files parse faster inline. */
const PARSE_WORKER_MIN_BYTES = 512 * 1024;

/** Run `fn` over `items` with at most `limit` in flight. */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        await fn(items[next++]);
      }
    }),
  );
}

const MAX_PAGES = 300;
const MAX_TOTAL_RTF_BYTES = 96 * 1024 * 1024;
const MAX_SINGLE_DOC_BYTES = 32 * 1024 * 1024;
const MAX_IMAGES = 200;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 64 * 1024 * 1024;
/** Same file name the editor's draw.io macro saves. */
const DRAWIO_FILE_NAME = 'diagram.drawio.svg';

export interface EaImportResult {
  pageIds: string[];
  rootPageIds: string[];
  pageCount: number;
  warnings: EaParseWarning[];
}

export interface EaImportMetadata {
  eaRootId: string;
  pageIds?: string[];
  rootPageIds?: string[];
  pageCount: number;
  warnings?: EaParseWarning[];
  skipped?: boolean;
  duplicate?: boolean;
  replacedPageIds?: string[];
  /** EA package GUID -> page id, cumulative across merges. */
  pageMap?: Record<string, string>;
  /** GUID -> text hash of pages still holding their import-time stub body. */
  stubHashes?: Record<string, string>;
  /** Duplicate prompt stats: how much of the file carries content. */
  contentPages?: number;
  stubPages?: number;
  merge?: { added: number; filled: number; kept: number; skipped: number };
}

interface PreparedPage {
  /** insert: new page; fill: empty stub gets content; keep/skip: untouched. */
  action: 'insert' | 'fill' | 'keep' | 'skip';
  node: EaPackageNode;
  id: string;
  slugId: string;
  parentPageId: string | null;
  title: string;
  content: any;
  ydoc: Buffer | null;
}

class EaImportCanceledError extends Error {
  constructor() {
    super('EA import canceled');
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

@Injectable()
export class EaImportService {
  private readonly logger = new Logger(EaImportService.name);

  constructor(
    private readonly importService: ImportService,
    private readonly pageService: PageService,
    private readonly htmlReportService: EaHtmlReportService,
    private readonly attachmentService: EaAttachmentService,
    private readonly storageService: StorageService,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly eventEmitter: EventEmitter2,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
    @InjectQueue(EA_IMPORT_QUEUE) private readonly eaImportQueue: Queue,
  ) {}

  /**
   * Persist the uploaded file and enqueue an asynchronous import. Returns the
   * inserted `file_tasks` row, which the client polls via `POST /file-tasks/info`.
   */
  async enqueueEaImport(
    file: MultipartFile,
    userId: string,
    spaceId: string,
    workspaceId: string,
    mode?: EaImportMode,
    parentPageId?: string,
  ): Promise<FileTask> {
    if (parentPageId) {
      const parent = await this.db
        .selectFrom('pages')
        .select('id')
        .where('id', '=', parentPageId)
        .where('spaceId', '=', spaceId)
        .where('deletedAt', 'is', null)
        .executeTakeFirst();
      if (!parent) {
        throw new BadRequestException('Invalid parent page');
      }
    }

    const fileExtension = path.extname(file.filename).toLowerCase();
    const baseName = sanitizeFileName(
      path.basename(file.filename, fileExtension),
    );
    const fileNameWithExt = baseName + fileExtension;

    const fileTaskId = v7();
    const filePath = `${getFileTaskFolderPath(
      FileTaskType.Import,
      workspaceId,
    )}/${fileTaskId}/${fileNameWithExt}`;

    const { stream, getBytesRead } = createByteCountingStream(file.file);
    await this.storageService.upload(filePath, stream);
    const fileSize = getBytesRead();

    const fileTask = await this.db
      .insertInto('fileTasks')
      .values({
        id: fileTaskId,
        type: FileTaskType.Import,
        source: EA_SOURCE,
        status: FileTaskStatus.Processing,
        fileName: fileNameWithExt,
        filePath,
        fileSize,
        fileExt: fileExtension.replace(/^\./, ''),
        creatorId: userId,
        spaceId,
        workspaceId,
        ...(parentPageId
          ? { metadata: { source: EA_SOURCE, parentPageId } as any }
          : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.eaImportQueue.add(
      EA_IMPORT_JOB,
      { fileTaskId, mode, parentPageId },
      { jobId: fileTaskId },
    );

    return fileTask;
  }

  /**
   * Worker entry point: read the stored file, run the import, then record the
   * result on the task and remove the stored file.
   */
  async processEaImportTask(
    fileTaskId: string,
    mode?: EaImportMode,
    parentPageId?: string,
  ): Promise<void> {
    const fileTask = await this.db
      .selectFrom('fileTasks')
      .selectAll()
      .where('id', '=', fileTaskId)
      .executeTakeFirst();

    if (!fileTask) {
      this.logger.log(`EA import task ${fileTaskId} not found`);
      return;
    }

    if (
      fileTask.status === FileTaskStatus.Success ||
      fileTask.status === FileTaskStatus.Failed ||
      fileTask.status === EA_STATUS_CANCELED
    ) {
      this.logger.log(`EA import task ${fileTaskId} already processed`);
      return;
    }

    try {
      if (!fileTask.filePath || !fileTask.spaceId || !fileTask.creatorId) {
        throw new Error(
          'EA import task is missing filePath, spaceId or creatorId',
        );
      }

      const stream = await this.storageService.readStream(fileTask.filePath);
      const buffer = await streamToBuffer(stream);

      const { metadata } = await this.runImport({
        buffer,
        fileName: fileTask.fileName,
        workspaceId: fileTask.workspaceId,
        spaceId: fileTask.spaceId,
        creatorId: fileTask.creatorId,
        fileTask,
        mode,
        parentPageId,
      });

      await this.db
        .updateTable('fileTasks')
        .set({
          status: FileTaskStatus.Success,
          errorMessage: null,
          metadata: { source: EA_SOURCE, parentPageId, ...metadata } as any,
          updatedAt: new Date(),
        })
        .where('id', '=', fileTaskId)
        .execute();

      await this.deleteStoredFile(fileTask.filePath);
    } catch (error) {
      if (error instanceof EaImportCanceledError) {
        this.logger.log(`EA import task ${fileTaskId} canceled`);
      } else {
        await this.markTaskFailed(fileTaskId, errorMessage(error));
      }
      if (fileTask.filePath) {
        await this.deleteStoredFile(fileTask.filePath);
      }
      if (!(error instanceof EaImportCanceledError)) {
        throw error;
      }
    }
  }

  /** Active (processing) EA imports of a user, so the client can resume tracking after a reload. */
  async listActive(userId: string, workspaceId: string): Promise<FileTask[]> {
    return this.db
      .selectFrom('fileTasks')
      .selectAll()
      .where('source', '=', EA_SOURCE)
      .where('type', '=', FileTaskType.Import)
      .where('status', '=', FileTaskStatus.Processing)
      .where('creatorId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  /**
   * Cancel a processing import. The worker notices on its next checkpoint (a
   * status guard on the progress update) and stops before pages are committed.
   */
  async cancelEaImport(
    fileTaskId: string,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const canceled = await this.db
      .updateTable('fileTasks')
      .set({ status: EA_STATUS_CANCELED, updatedAt: new Date() })
      .where('id', '=', fileTaskId)
      .where('source', '=', EA_SOURCE)
      .where('creatorId', '=', userId)
      .where('workspaceId', '=', workspaceId)
      .where('status', '=', FileTaskStatus.Processing)
      .returning('filePath')
      .executeTakeFirst();
    if (!canceled) {
      throw new NotFoundException('No running import found');
    }

    // Still waiting in the queue: drop it, the worker will never see it.
    const job = await this.eaImportQueue.getJob(fileTaskId);
    if (job && (await job.isWaiting())) {
      await job.remove().catch(() => undefined);
      if (canceled.filePath) {
        await this.deleteStoredFile(canceled.filePath);
      }
    }
  }

  /**
   * Record progress (0-100) in the task metadata. The update only matches
   * while the task is still processing, so a canceled task aborts the import.
   */
  private async checkpoint(taskId: string, progress: number): Promise<void> {
    const row = await this.db
      .updateTable('fileTasks')
      .set({
        metadata: sql`coalesce(metadata, '{}'::jsonb) || ${JSON.stringify({
          progress: Math.round(progress),
        })}::jsonb` as any,
      })
      .where('id', '=', taskId)
      .where('status', '=', FileTaskStatus.Processing)
      .returning('id')
      .executeTakeFirst();
    if (!row) {
      throw new EaImportCanceledError();
    }
  }

  /**
   * Mark a task as failed. Also invoked from the processor's `failed` event so
   * a crash outside `processEaImportTask` still surfaces an error message.
   */
  async markTaskFailed(fileTaskId: string, reason: string): Promise<void> {
    if (!fileTaskId) {
      return;
    }
    try {
      await this.db
        .updateTable('fileTasks')
        .set({
          status: FileTaskStatus.Failed,
          errorMessage: reason || 'Unknown error',
          updatedAt: new Date(),
        })
        .where('id', '=', fileTaskId)
        .where('status', '=', FileTaskStatus.Processing)
        .execute();
    } catch (error) {
      this.logger.error('Failed to mark EA import task as failed', error);
    }
  }

  /**
   * Read an EA ZIP once, surfacing archive-level failures with a clear message.
   */
  private async inspectArchive(buffer: Buffer): Promise<EaArchiveInspection> {
    try {
      return await inspectEaArchive(buffer);
    } catch (error) {
      throw new Error(
        `Invalid Enterprise Architect archive: ${errorMessage(error)}`,
      );
    }
  }

  /**
   * Parse an EA export buffer (native EA table export, BPMN 2.0 XML or XMI/UML)
   * on a worker thread so a large file does not block the API event loop,
   * surfacing parse failures with a clear message.
   */
  private async parseDocument(buffer: Buffer): Promise<EaParseResult> {
    const result = (
      await runEaCpuJobs([{ kind: 'parse', id: 'parse', buffer }], undefined, {
        forceWorkers: buffer.length > PARSE_WORKER_MIN_BYTES,
      })
    ).get('parse');
    if (!result?.parsed) {
      throw new Error(
        `Invalid Enterprise Architect file: ${result?.error ?? 'parse failed'}`,
      );
    }
    return result.parsed;
  }

  /**
   * Parse the EA export (optionally from a companion ZIP). When the same EA
   * root package was already imported into this space the import is skipped
   * unless the user chose `replace` (delete the previous tree after the fresh
   * import commits) or `keep` (import an additional copy alongside it).
   */
  private async runImport(opts: {
    buffer: Buffer;
    fileName: string;
    workspaceId: string;
    spaceId: string;
    creatorId: string;
    fileTask: FileTask;
    mode?: EaImportMode;
    parentPageId?: string;
  }): Promise<{ result: EaImportResult; metadata: EaImportMetadata }> {
    const { buffer, fileName, workspaceId, spaceId, creatorId, mode } = opts;
    const rootParentId = opts.parentPageId ?? null;
    const taskId = opts.fileTask.id;
    const startedAt = Date.now();
    const lap = (label: string): void =>
      this.logger.log(
        `EA import ${taskId} ${label}: ${Date.now() - startedAt}ms`,
      );
    await this.checkpoint(taskId, 2);

    let parsed: EaParseResult;
    let byKey = new Map<string, EaImageAsset>();

    if (isZipBuffer(buffer)) {
      const inspection = await this.inspectArchive(buffer);

      if (!inspection.xmi) {
        if (inspection.htmlPages.length === 0) {
          throw new Error(
            'EA archive contains neither an XMI document nor HTML pages',
          );
        }

        const result = await this.htmlReportService.importHtmlReport({
          buffer,
          fileTask: opts.fileTask,
          onProgress: (pct) => this.checkpoint(taskId, pct),
          spaceId,
          workspaceId,
          creatorId,
          parentPageId: rootParentId,
        });

        return {
          result,
          metadata: {
            eaRootId: result.rootPageIds[0] ?? `ea-html:${fileName}`,
            pageIds: result.pageIds,
            rootPageIds: result.rootPageIds,
            pageCount: result.pageCount,
            warnings: result.warnings,
          },
        };
      }

      parsed = await this.parseDocument(inspection.xmi);
      byKey = new Map(
        inspection.images.map((image) => [
          normalizeAssetKey(image.fileName),
          image,
        ]),
      );
    } else {
      parsed = await this.parseDocument(buffer);
    }

    await this.checkpoint(taskId, 10);
    lap('parsed');
    const warnings: EaParseWarning[] = [...parsed.warnings];

    if (parsed.roots.length === 0) {
      const reason = parsed.warnings[0]?.reason;
      throw new Error(
        `No importable Enterprise Architect content found${reason ? ` (${reason})` : ''}`,
      );
    }

    const eaRootId = eaRootSignature(parsed.roots);

    const existingImport = eaRootId
      ? await this.findExistingImport(spaceId, workspaceId, eaRootId)
      : undefined;

    if (existingImport && !mode) {
      this.logger.log(
        `Skipping EA import: root signature ${eaRootId} already imported in space ${spaceId}`,
      );
      const allNodes = flattenEaNodes(parsed.roots);
      const contentPages = allNodes.filter(eaNodeHasContent).length;
      return {
        result: {
          pageIds: [],
          rootPageIds: [],
          pageCount: 0,
          warnings: [
            {
              page: '',
              reason: 'EA package already imported in this space',
            },
          ],
        },
        metadata: {
          eaRootId,
          pageCount: 0,
          skipped: true,
          duplicate: true,
          contentPages,
          stubPages: allNodes.length - contentPages,
          replacedPageIds: this.metadataStringArray(
            existingImport.metadata,
            'rootPageIds',
            'pageIds',
          ),
        },
      };
    }

    const replacedRootPageIds =
      existingImport && mode === 'replace'
        ? this.metadataStringArray(
            existingImport.metadata,
            'rootPageIds',
            'pageIds',
          )
        : [];
    const replacedTaskId =
      existingImport && mode === 'replace' ? existingImport.id : null;

    // Flatten the package tree breadth-first so parents are always prepared
    // (and inserted) before their children.
    const prepared: PreparedPage[] = [];
    const pageIdByNode = new Map<EaPackageNode, string>();
    const slugIdByNode = new Map<EaPackageNode, string>();
    const queue: Array<{ node: EaPackageNode; parent: EaPackageNode | null }> =
      parsed.roots.map((node) => ({ node, parent: null }));

    // Merge: pages from earlier imports of this package are reused by GUID.
    const merge =
      existingImport && mode === 'merge'
        ? await this.loadMergeTargets(
            existingImport.metadata,
            flattenEaNodes(parsed.roots),
            spaceId,
          )
        : null;

    while (queue.length > 0) {
      const { node, parent } = queue.shift()!;
      const hit = merge?.targets.get(node.id);
      const id = hit?.id ?? v7();
      const slugId = hit?.slugId ?? generateSlugId();
      let action: PreparedPage['action'] = 'insert';
      if (hit) {
        const stubHash = merge!.stubHashes[node.id];
        action = !eaNodeHasContent(node)
          ? 'keep'
          : stubHash !== undefined && textHash(hit.textContent) === stubHash
            ? 'fill'
            : 'skip';
      }
      pageIdByNode.set(node, id);
      slugIdByNode.set(node, slugId);
      prepared.push({
        action,
        node,
        id,
        slugId,
        parentPageId: parent ? pageIdByNode.get(parent) ?? null : null,
        title: '',
        content: null,
        ydoc: null,
      });
      for (const child of node.children) {
        queue.push({ node: child, parent: node });
      }
    }

    if (prepared.length === 0) {
      throw new Error('No importable Enterprise Architect content found');
    }

    // Only pages that are created or filled need converting; the rest of a
    // merge export (title-only stubs, already-populated pages) is left alone.
    const work = prepared.filter(
      (page) => page.action === 'insert' || page.action === 'fill',
    );
    for (const page of prepared) {
      if (page.action === 'skip') {
        warnings.push({
          page: page.node.name,
          reason: 'Page already has content; it was not overwritten',
        });
      }
    }

    if (work.length > MAX_PAGES) {
      throw new Error(
        `Import exceeds the ${MAX_PAGES} page limit (found ${work.length}); export a smaller EA package.`,
      );
    }

    const documentContent = await this.convertDocuments(work, warnings);
    await this.checkpoint(taskId, 25);
    lap('documents converted');

    const imageBudget = { count: 0, bytes: 0 };

    // Phase A (I/O bound): build each page's HTML, uploading its images.
    const htmlByPage = new Map<string, { html: string; title: string }>();
    let built = 0;
    await mapLimit(work, IMAGE_UPLOAD_CONCURRENCY, async (page) => {
      await this.checkpoint(taskId, 25 + (35 * built) / work.length);
      built += 1;
      const { node } = page;
      const isRoot = node.parentId === null;
      const stripped = isRoot
        ? stripEaCodePrefix(node.name)
        : { title: node.name, code: null as string | null };
      const title = (stripped.title || node.name || 'Untitled').normalize('NFC');

      const imageHtmlById = await this.prepareDiagramImages(
        node,
        page.id,
        title,
        byKey,
        { workspaceId, spaceId, creatorId },
        imageBudget,
        warnings,
      );

      let html: string;
      if (node.documents.length > 0) {
        const converted = documentContent.get(node) ?? {
          html: '',
          images: [] as EaRtfImage[],
        };
        html = await this.embedRtfImages(
          converted.html,
          converted.images,
          page.id,
          title,
          { workspaceId, spaceId, creatorId },
          imageBudget,
          warnings,
        );
        // A page can carry both documents and diagrams (e.g. a wireframe
        // description attached to the diagram plus its exported image); keep
        // the diagram images instead of dropping them.
        for (const diagram of node.diagrams) {
          const image = imageHtmlById.get(diagram.diagramId ?? diagram.name);
          if (image) {
            html += image;
          }
        }
      } else if (
        node.activities.length > 0 ||
        node.edges.length > 0 ||
        node.lanes.length > 0
      ) {
        html = buildFlowHtml(node, imageHtmlById);
      } else if (node.diagrams.length > 0) {
        html = buildDiagramHtml(node, imageHtmlById);
      } else {
        html = buildContainerHtml(node, stripped.code);
      }
      htmlByPage.set(page.id, { html, title });
      page.title = title;
    });

    lap('html built');

    // Phase B (CPU bound): HTML -> ProseMirror -> Yjs on worker threads.
    let converted = 0;
    const pageResults = await runEaCpuJobs(
      work.map((page) => ({
        kind: 'page' as const,
        id: page.id,
        html: htmlByPage.get(page.id)!.html,
        title: htmlByPage.get(page.id)!.title,
      })),
      async () => {
        converted += 1;
        await this.checkpoint(taskId, 60 + (30 * converted) / work.length);
      },
    );
    for (const page of work) {
      const result = pageResults.get(page.id);
      if (result?.error) {
        warnings.push({
          page: page.title,
          reason: `Failed to convert page content: ${result.error}`,
        });
      }
      page.content = result?.content ?? {
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      };
      page.ydoc = result?.ydoc ? Buffer.from(result.ydoc) : null;
    }

    const pageIds: string[] = [];
    const rootPageIds: string[] = [];
    const filledIds: string[] = [];
    const inserts = work.filter((page) => page.action === 'insert');
    const insertedIds = new Set(inserts.map((page) => page.id));

    lap('pages converted');

    // Last cancellable point: the transaction below commits all pages at once.
    await this.checkpoint(taskId, 92);

    await executeTx(this.db, async (trx) => {
      // New parents have no children yet, so only the first root needs a DB
      // lookup; every other position is chained in memory. A merge can add
      // children under a page that already exists, which needs a DB lookup too.
      const lastPosition = new Map<string | null, string>();
      const rows: InsertablePage[] = [];
      for (const page of inserts) {
        const key = page.parentPageId;
        const previous = lastPosition.get(key);
        const position =
          previous !== undefined
            ? generateJitteredKeyBetween(previous, null)
            : key === null
              ? await this.pageService.nextPagePosition(
                  spaceId,
                  rootParentId ?? undefined,
                  trx,
                )
              : !insertedIds.has(key)
                ? await this.pageService.nextPagePosition(spaceId, key, trx)
                : generateJitteredKeyBetween(null, null);
        lastPosition.set(key, position);

        rows.push({
          id: page.id,
          slugId: page.slugId,
          title: page.title,
          content: page.content,
          textContent: jsonToText(page.content),
          ydoc: page.ydoc,
          position,
          spaceId,
          workspaceId,
          creatorId,
          lastUpdatedById: creatorId,
          parentPageId: page.parentPageId ?? rootParentId,
        });
        pageIds.push(page.id);
        if (page.parentPageId === null) {
          rootPageIds.push(page.id);
        }
      }
      // Parents precede children (BFS order), so chunked inserts satisfy the FK.
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        await trx
          .insertInto('pages')
          .values(rows.slice(i, i + INSERT_BATCH))
          .execute();
      }

      // Fill-only: the body is written only if the page is still its untouched stub.
      for (const page of work) {
        if (page.action !== 'fill') {
          continue;
        }
        const stubHash = merge!.stubHashes[page.node.id];
        const text = jsonToText(page.content);
        const res = await trx
          .updateTable('pages')
          .set({
            content: page.content,
            textContent: text,
            ydoc: page.ydoc,
            lastUpdatedById: creatorId,
            updatedAt: new Date(),
          })
          .where('id', '=', page.id)
          .where('deletedAt', 'is', null)
          .where(
            sql<boolean>`md5(coalesce(text_content, '')) = ${stubHash}`,
          )
          .executeTakeFirst();
        if (Number(res.numUpdatedRows) > 0) {
          filledIds.push(page.id);
        }
      }
    });

    lap('pages inserted');

    if (pageIds.length > 0) {
      this.eventEmitter.emit(EventName.PAGE_CREATED, {
        pageIds,
        workspaceId,
      });
    }
    if (filledIds.length > 0) {
      this.eventEmitter.emit(EventName.PAGE_UPDATED, {
        pageIds: filledIds,
        workspaceId,
      });
    }

    await this.auditService.log({
      event: AuditEvent.PAGE_IMPORTED,
      resourceType: AuditResource.PAGE,
      resourceId: spaceId,
      spaceId,
      metadata: {
        source: EA_SOURCE,
        fileName,
        pageCount: pageIds.length,
      },
    });

    if (replacedRootPageIds.length > 0 || replacedTaskId) {
      await this.replaceExistingImport(
        replacedRootPageIds,
        replacedTaskId,
        workspaceId,
      );
    }

    this.logger.log(
      `Imported ${pageIds.length} EA pages, filled ${filledIds.length} (${warnings.length} warnings)`,
    );

    // Cumulative page map + stub hashes let the next merge find these pages.
    const pageMap = { ...merge?.pageMap };
    const stubHashes = { ...merge?.stubHashes };
    for (const page of inserts) {
      pageMap[page.node.id] = page.id;
      if (eaNodeHasContent(page.node)) {
        delete stubHashes[page.node.id];
      } else {
        stubHashes[page.node.id] = textHash(jsonToText(page.content));
      }
    }
    const filled = new Set(filledIds);
    for (const page of work) {
      if (filled.has(page.id)) {
        delete stubHashes[page.node.id];
      }
    }

    return {
      result: {
        pageIds,
        rootPageIds,
        pageCount: pageIds.length + filledIds.length,
        warnings,
      },
      metadata: {
        eaRootId,
        pageIds: [...(merge?.pageIds ?? []), ...pageIds],
        rootPageIds: [...(merge?.rootPageIds ?? []), ...rootPageIds],
        pageCount: pageIds.length + filledIds.length,
        warnings,
        pageMap,
        stubHashes,
        ...(merge && {
          merge: {
            added: pageIds.length,
            filled: filledIds.length,
            kept: prepared.filter((page) => page.action === 'keep').length,
            skipped: prepared.filter((page) => page.action === 'skip').length,
          },
        }),
      },
    };
  }

  /**
   * Resolve which pages of the new export already exist from earlier imports of
   * the same package, by EA GUID. Imports from before the page map was recorded
   * are mapped through `pageIds`, which was written in the same breadth-first
   * order as `flattenEaNodes`.
   */
  private async loadMergeTargets(
    metadata: any,
    nodes: EaPackageNode[],
    spaceId: string,
  ) {
    let legacy = false;
    let pageMap: Record<string, string> = metadata?.pageMap ?? {};
    const pageIds = this.metadataStringArray(metadata, 'pageIds');
    if (!metadata?.pageMap) {
      legacy = true;
      if (pageIds.length !== nodes.length) {
        throw new Error(
          'The previous import cannot be matched to this file (the package tree changed). Use Keep both or Replace.',
        );
      }
      pageMap = Object.fromEntries(nodes.map((n, i) => [n.id, pageIds[i]]));
    }

    const mappedIds = Object.values(pageMap);
    const rows = mappedIds.length
      ? await this.db
          .selectFrom('pages')
          .select(['id', 'slugId', 'textContent'])
          .where('spaceId', '=', spaceId)
          .where('deletedAt', 'is', null)
          .where('id', 'in', mappedIds)
          .execute()
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));

    const targets = new Map<
      string,
      { id: string; slugId: string; textContent: string | null }
    >();
    const stubHashes: Record<string, string> = { ...metadata?.stubHashes };
    for (const [guid, id] of Object.entries(pageMap)) {
      const row = byId.get(id);
      if (!row) {
        continue;
      }
      targets.set(guid, row);
      // ponytail: legacy imports have no hashes; seed them from the stub-shaped body.
      if (legacy && isLegacyStubText(row.textContent)) {
        stubHashes[guid] = textHash(row.textContent);
      }
    }

    return {
      targets,
      stubHashes,
      pageMap,
      pageIds,
      rootPageIds: this.metadataStringArray(metadata, 'rootPageIds'),
    };
  }

  /**
   * Convert every page's Model Documents (base64 ZIP -> RTF -> HTML) ahead of
   * the page loop. Documents are independent and CPU-bound, so they run across
   * a worker-thread pool; the per-document and total byte budgets are enforced
   * up-front via a cheap size pre-scan (workers run without a shared budget).
   */
  private async convertDocuments(
    prepared: PreparedPage[],
    warnings: EaParseWarning[],
  ): Promise<Map<EaPackageNode, { html: string; images: EaRtfImage[] }>> {
    const result = new Map<
      EaPackageNode,
      { html: string; images: EaRtfImage[] }
    >();
    const nodesWithDocuments = prepared
      .map((page) => page.node)
      .filter((node) => node.documents.length > 0);
    if (nodesWithDocuments.length === 0) {
      return result;
    }

    interface DocEntry {
      id?: string;
      skipReason?: string;
      warningPage: string;
    }
    const entriesByNode = new Map<EaPackageNode, DocEntry[]>();
    const tasks: Array<{ id: string; base64: string }> = [];
    let totalBytes = 0;
    let counter = 0;

    for (const node of nodesWithDocuments) {
      const entries: DocEntry[] = [];
      for (const document of node.documents) {
        const warningPage = document.ownerName || node.name;
        const size = await readModelDocumentUncompressedSize(document.base64);
        let skipReason: string | undefined;
        if (size !== null && size > MAX_SINGLE_DOC_BYTES) {
          skipReason = `Model document exceeds the ${MAX_SINGLE_DOC_BYTES} byte per-document limit`;
        } else if (size !== null && totalBytes + size > MAX_TOTAL_RTF_BYTES) {
          skipReason = `Model documents exceed the ${MAX_TOTAL_RTF_BYTES} byte total limit`;
        }
        if (skipReason) {
          entries.push({ skipReason, warningPage });
          continue;
        }
        if (size !== null) {
          totalBytes += size;
        }
        const id = `doc-${counter}`;
        counter += 1;
        entries.push({ id, warningPage });
        tasks.push({ id, base64: document.base64 });
      }
      entriesByNode.set(node, entries);
    }

    const converted = await convertModelDocuments(tasks, MAX_SINGLE_DOC_BYTES);

    for (const node of nodesWithDocuments) {
      let html = '';
      const images: EaRtfImage[] = [];
      for (const entry of entriesByNode.get(node) ?? []) {
        if (entry.skipReason) {
          warnings.push({ page: entry.warningPage, reason: entry.skipReason });
          html += '<p></p>';
          continue;
        }
        const convertedDoc = entry.id ? converted.get(entry.id) : undefined;
        if (
          convertedDoc &&
          !convertedDoc.error &&
          typeof convertedDoc.html === 'string'
        ) {
          html += convertedDoc.html;
          if (convertedDoc.images) {
            images.push(...convertedDoc.images);
          }
        } else {
          warnings.push({
            page: entry.warningPage,
            reason: convertedDoc?.error ?? 'Failed to convert model document',
          });
          html += '<p></p>';
        }
      }
      result.set(node, { html, images });
    }

    return result;
  }

  /** Most recent successful EA import in this space with the same root signature. */
  private async findExistingImport(
    spaceId: string,
    workspaceId: string,
    eaRootId: string,
  ): Promise<{ id: string; metadata: any } | undefined> {
    if (!eaRootId) {
      return undefined;
    }
    return this.db
      .selectFrom('fileTasks')
      .select(['id', 'metadata'])
      .where('source', '=', EA_SOURCE)
      .where('status', '=', FileTaskStatus.Success)
      .where('spaceId', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .where(sql<boolean>`metadata->>'eaRootId' = ${eaRootId}`)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  /** First non-empty string array among the given metadata keys. */
  private metadataStringArray(
    metadata: any,
    ...keys: string[]
  ): string[] {
    for (const key of keys) {
      const value = metadata?.[key];
      if (Array.isArray(value)) {
        const ids = value.filter((id): id is string => typeof id === 'string');
        if (ids.length > 0) {
          return ids;
        }
      }
    }
    return [];
  }

  /**
   * Replace semantics: delete the previously imported page tree, then neutralize
   * the old task's signature so future imports are not flagged as duplicates.
   * Runs after the new tree is committed; failures are logged, never thrown.
   */
  private async replaceExistingImport(
    rootPageIds: string[],
    taskId: string | null,
    workspaceId: string,
  ): Promise<void> {
    for (const rootPageId of rootPageIds) {
      try {
        await this.pageService.forceDelete(rootPageId, workspaceId);
      } catch (error) {
        this.logger.error(
          `Failed to delete replaced EA page ${rootPageId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    if (taskId) {
      try {
        await this.db
          .updateTable('fileTasks')
          .set({ metadata: sql`metadata - 'eaRootId'` as any })
          .where('id', '=', taskId)
          .execute();
      } catch (error) {
        this.logger.error(
          `Failed to clear replaced EA task signature ${taskId}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  /**
   * Resolve and upload the companion (or embedded) image for every diagram
   * owned by a page, returning a map from diagram key to `<img>` HTML. Uploads
   * happen before the page transaction; any failure is a warning and never
   * aborts the import.
   */
  private async prepareDiagramImages(
    node: EaPackageNode,
    pageId: string,
    pageTitle: string,
    byKey: Map<string, EaImageAsset>,
    context: { workspaceId: string; spaceId: string; creatorId: string },
    budget: { count: number; bytes: number },
    warnings: EaParseWarning[],
  ): Promise<Map<string, string>> {
    const imageHtmlById = new Map<string, string>();
    if (node.diagrams.length === 0) {
      return imageHtmlById;
    }

    for (const diagram of node.diagrams) {
      const key = diagram.diagramId ?? diagram.name;
      const asset =
        resolveImageForDiagram(diagram, byKey) ?? diagram.embeddedImage;
      if (!asset) {
        if (diagram.wireframe?.length && !imageHtmlById.has(key)) {
          const html = await this.uploadWireframeDrawio(
            diagram,
            pageId,
            pageTitle,
            context,
            warnings,
          );
          if (html) {
            imageHtmlById.set(key, html);
          }
        }
        continue;
      }

      if (imageHtmlById.has(key)) {
        continue;
      }

      if (budget.count >= MAX_IMAGES) {
        warnings.push({
          page: pageTitle,
          reason: `Diagram image limit reached (${MAX_IMAGES}); remaining images were skipped.`,
        });
        break;
      }
      if (asset.buffer.length > MAX_IMAGE_BYTES) {
        warnings.push({
          page: pageTitle,
          reason: `Diagram image ${asset.fileName} exceeds the 8 MB limit and was skipped.`,
        });
        continue;
      }
      if (budget.bytes + asset.buffer.length > MAX_TOTAL_IMAGE_BYTES) {
        warnings.push({
          page: pageTitle,
          reason:
            'Diagram images exceed the 64 MB total limit; remaining images were skipped.',
        });
        break;
      }

      try {
        const uploaded = await this.attachmentService.uploadImage({
          buffer: asset.buffer,
          fileName: asset.fileName,
          mimeType: asset.mimeType,
          pageId,
          workspaceId: context.workspaceId,
          spaceId: context.spaceId,
          creatorId: context.creatorId,
        });
        imageHtmlById.set(key, uploaded.imgHtml);
        budget.count += 1;
        budget.bytes += asset.buffer.length;
      } catch (error) {
        warnings.push({
          page: pageTitle,
          reason: `Failed to import diagram image ${asset.fileName}: ${errorMessage(error)}`,
        });
      }
    }

    return imageHtmlById;
  }

  /**
   * Turn a diagram's Wireframing controls into an editable draw.io node.
   * Returns null (with a warning) when the upload fails.
   */
  private async uploadWireframeDrawio(
    diagram: EaDiagram,
    pageId: string,
    pageTitle: string,
    context: { workspaceId: string; spaceId: string; creatorId: string },
    warnings: EaParseWarning[],
  ): Promise<string | null> {
    try {
      const buffer = Buffer.from(
        buildWireframeDrawioSvg(diagram.wireframe ?? []),
        'utf-8',
      );
      const uploaded = await this.attachmentService.uploadImage({
        buffer,
        fileName: DRAWIO_FILE_NAME,
        mimeType: 'image/svg+xml',
        pageId,
        workspaceId: context.workspaceId,
        spaceId: context.spaceId,
        creatorId: context.creatorId,
      });
      return drawioNodeHtml({
        src: uploaded.apiFilePath,
        attachmentId: uploaded.attachmentId,
        fileName: DRAWIO_FILE_NAME,
        size: buffer.length,
      });
    } catch (error) {
      warnings.push({
        page: pageTitle,
        reason: `Failed to convert wireframe ${diagram.name} to draw.io: ${errorMessage(error)}`,
      });
      return null;
    }
  }

  /**
   * Upload every `\pict` image extracted from a page's RTF documents and swap
   * its placeholder for the returned `<img>` HTML, sharing the diagram image
   * budget. Any failure or over-budget image is dropped with a warning.
   */
  private async embedRtfImages(
    html: string,
    images: EaRtfImage[],
    pageId: string,
    pageTitle: string,
    context: { workspaceId: string; spaceId: string; creatorId: string },
    budget: { count: number; bytes: number },
    warnings: EaParseWarning[],
  ): Promise<string> {
    if (images.length === 0) {
      return html;
    }

    let result = html;
    for (let index = 0; index < images.length; index += 1) {
      const image = images[index];
      const placeholder = eaRtfImagePlaceholder(index);
      if (!result.includes(placeholder)) {
        continue;
      }

      const drop = (): void => {
        result = result.split(placeholder).join('');
      };

      if (budget.count >= MAX_IMAGES) {
        warnings.push({
          page: pageTitle,
          reason: `RTF image limit reached (${MAX_IMAGES}); remaining images were skipped.`,
        });
        drop();
        continue;
      }
      if (image.buffer.length > MAX_IMAGE_BYTES) {
        warnings.push({
          page: pageTitle,
          reason: `RTF image ${index} exceeds the 8 MB limit and was skipped.`,
        });
        drop();
        continue;
      }
      if (budget.bytes + image.buffer.length > MAX_TOTAL_IMAGE_BYTES) {
        warnings.push({
          page: pageTitle,
          reason:
            'RTF images exceed the 64 MB total limit; remaining images were skipped.',
        });
        drop();
        break;
      }

      const ext =
        image.mimeType === 'image/png'
          ? '.png'
          : image.mimeType === 'image/jpeg'
            ? '.jpg'
            : '';
      try {
        const uploaded = await this.attachmentService.uploadImage({
          buffer: image.buffer,
          fileName: `rtf-image-${index}${ext}`,
          mimeType: image.mimeType,
          pageId,
          workspaceId: context.workspaceId,
          spaceId: context.spaceId,
          creatorId: context.creatorId,
        });
        result = result.split(placeholder).join(uploaded.imgHtml);
        budget.count += 1;
        budget.bytes += image.buffer.length;
      } catch (error) {
        warnings.push({
          page: pageTitle,
          reason: `Failed to import RTF image ${index}: ${errorMessage(error)}`,
        });
        drop();
      }
    }

    return result;
  }

  private async deleteStoredFile(filePath: string): Promise<void> {
    try {
      await this.storageService.delete(filePath);
    } catch (error) {
      this.logger.error(
        `Failed to delete stored EA import file ${filePath}`,
        error,
      );
    }
  }
}
