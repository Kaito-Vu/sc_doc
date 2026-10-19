import {
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
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { v7 } from 'uuid';
import { sql } from 'kysely';
import * as path from 'path';
import { buffer as streamToBuffer } from 'stream/consumers';
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
  stripEaCodePrefix,
} from './ea-content.builder';
import { convertNodeDocuments } from './ea-convert.pool';
import {
  EaArchiveInspection,
  inspectEaArchive,
  isZipBuffer,
  normalizeAssetKey,
} from './ea-asset.util';
import { EaAttachmentService } from './ea-attachment.service';
import { EaHtmlReportService } from './ea-html-report.service';
import { EaImageContext, EaImageEmbedder } from './ea-image-embedder';
import {
  EA_IMPORT_JOB,
  EA_IMPORT_QUEUE,
  EA_STATUS_CANCELED,
} from './ea-import.constants';
import {
  eaNodeHasContent,
  eaRootSignature,
  errorMessage,
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
const MAX_PAGES = 300;

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

interface ExistingImport {
  id: string;
  metadata: any;
}

interface MergeTargets {
  /** EA GUID -> existing page; `editable` = the importer may write it. */
  targets: Map<
    string,
    { id: string; slugId: string; textContent: string | null; editable: boolean }
  >;
  stubHashes: Record<string, string>;
  pageMap: Record<string, string>;
  pageIds: string[];
  rootPageIds: string[];
}

interface ImportScope extends EaImageContext {
  /** Page the imported roots are created under (null = space root). */
  rootParentId: string | null;
}

class EaImportCanceledError extends Error {
  constructor() {
    super('EA import canceled');
  }
}

@Injectable()
export class EaImportService {
  private readonly logger = new Logger(EaImportService.name);

  constructor(
    private readonly pageService: PageService,
    private readonly pagePermissionRepo: PagePermissionRepo,
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
   * The caller has already authorized the space and the parent page.
   */
  async enqueueEaImport(
    file: MultipartFile,
    userId: string,
    spaceId: string,
    workspaceId: string,
    mode?: EaImportMode,
    parentPageId?: string,
  ): Promise<FileTask> {
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

    try {
      await this.eaImportQueue.add(
        EA_IMPORT_JOB,
        { fileTaskId, mode, parentPageId },
        { jobId: fileTaskId },
      );
    } catch (error) {
      // Never leave a task stuck in "processing" with no job behind it.
      await this.markTaskFailed(fileTaskId, 'Failed to queue the import');
      await this.deleteStoredFile(filePath);
      throw error;
    }

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
    } catch (error) {
      if (error instanceof EaImportCanceledError) {
        this.logger.log(`EA import task ${fileTaskId} canceled`);
        return;
      }
      await this.markTaskFailed(fileTaskId, errorMessage(error));
      throw error;
    } finally {
      if (fileTask.filePath) {
        await this.deleteStoredFile(fileTask.filePath);
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
   * unless the user chose `replace` (trash the previous tree after the fresh
   * import commits), `keep` (import an additional copy alongside it) or
   * `merge` (fill the previous tree's untouched stubs, add new packages).
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
    const scope: ImportScope = {
      workspaceId,
      spaceId,
      creatorId,
      rootParentId: opts.parentPageId ?? null,
    };
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
        return this.importHtmlReport(opts, scope, inspection);
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
      return this.duplicateResult(parsed.roots, eaRootId, existingImport);
    }

    // Merge: pages from earlier imports of this package are reused by GUID.
    const merge =
      existingImport && mode === 'merge'
        ? await this.loadMergeTargets(
            existingImport.metadata,
            flattenEaNodes(parsed.roots),
            spaceId,
            creatorId,
          )
        : null;
    const prepared = this.planPages(parsed.roots, merge);

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

    const documentContent = await convertNodeDocuments(
      work.map((page) => page.node),
      warnings,
    );
    await this.checkpoint(taskId, 25);
    lap('documents converted');

    const images = new EaImageEmbedder(
      this.attachmentService,
      scope,
      byKey,
      warnings,
    );
    const htmlByPage = await this.buildPagesHtml(
      work,
      documentContent,
      images,
      taskId,
    );
    lap('html built');

    await this.convertPages(work, htmlByPage, warnings, taskId);
    lap('pages converted');

    // Last cancellable point: the transaction below commits all pages at once.
    await this.checkpoint(taskId, 92);

    const { pageIds, rootPageIds, filledIds } = await this.commitPages(
      work,
      merge,
      scope,
    );
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

    if (existingImport && mode === 'replace') {
      await this.replaceExistingImport(existingImport, scope, warnings);
    }

    this.logger.log(
      `Imported ${pageIds.length} EA pages, filled ${filledIds.length} (${warnings.length} warnings)`,
    );

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
        ...this.mergeBookkeeping(prepared, work, merge, filledIds),
      },
    };
  }

  /** ZIP without an XMI document: an EA HTML report. */
  private async importHtmlReport(
    opts: { buffer: Buffer; fileName: string; fileTask: FileTask },
    scope: ImportScope,
    archive: EaArchiveInspection,
  ): Promise<{ result: EaImportResult; metadata: EaImportMetadata }> {
    if (archive.htmlPages.length === 0) {
      throw new Error(
        'EA archive contains neither an XMI document nor HTML pages',
      );
    }
    const result = await this.htmlReportService.importHtmlReport({
      buffer: opts.buffer,
      archive,
      fileTask: opts.fileTask,
      onProgress: (pct) => this.checkpoint(opts.fileTask.id, pct),
      spaceId: scope.spaceId,
      workspaceId: scope.workspaceId,
      creatorId: scope.creatorId,
      parentPageId: scope.rootParentId,
    });
    return {
      result,
      metadata: {
        eaRootId: result.rootPageIds[0] ?? `ea-html:${opts.fileName}`,
        pageIds: result.pageIds,
        rootPageIds: result.rootPageIds,
        pageCount: result.pageCount,
        warnings: result.warnings,
      },
    };
  }

  /** Same root package already imported and no mode chosen: create nothing. */
  private duplicateResult(
    roots: EaPackageNode[],
    eaRootId: string,
    existingImport: ExistingImport,
  ): { result: EaImportResult; metadata: EaImportMetadata } {
    const allNodes = flattenEaNodes(roots);
    const contentPages = allNodes.filter(eaNodeHasContent).length;
    return {
      result: {
        pageIds: [],
        rootPageIds: [],
        pageCount: 0,
        warnings: [
          { page: '', reason: 'EA package already imported in this space' },
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

  /**
   * Flatten the package tree breadth-first so parents are always prepared
   * (and inserted) before their children, deciding per node whether it is a
   * new page or (merge) an existing page to fill, keep or skip.
   */
  private planPages(
    roots: EaPackageNode[],
    merge: MergeTargets | null,
  ): PreparedPage[] {
    const prepared: PreparedPage[] = [];
    const pageIdByNode = new Map<EaPackageNode, string>();
    const queue: Array<{ node: EaPackageNode; parent: EaPackageNode | null }> =
      roots.map((node) => ({ node, parent: null }));

    while (queue.length > 0) {
      const { node, parent } = queue.shift()!;
      const hit = merge?.targets.get(node.id);
      let action: PreparedPage['action'] = 'insert';
      if (hit) {
        const stubHash = merge!.stubHashes[node.id];
        action = !eaNodeHasContent(node)
          ? 'keep'
          : hit.editable &&
              stubHash !== undefined &&
              textHash(hit.textContent) === stubHash
            ? 'fill'
            : 'skip';
      }
      const id = hit?.id ?? v7();
      pageIdByNode.set(node, id);
      prepared.push({
        action,
        node,
        id,
        slugId: hit?.slugId ?? generateSlugId(),
        parentPageId: parent ? (pageIdByNode.get(parent) ?? null) : null,
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
    return prepared;
  }

  /** Phase A (I/O bound): build each page's HTML, uploading its images. */
  private async buildPagesHtml(
    work: PreparedPage[],
    documentContent: Map<EaPackageNode, { html: string; images: EaRtfImage[] }>,
    images: EaImageEmbedder,
    taskId: string,
  ): Promise<Map<string, string>> {
    const htmlByPage = new Map<string, string>();
    let built = 0;
    await mapLimit(work, IMAGE_UPLOAD_CONCURRENCY, async (page) => {
      await this.checkpoint(taskId, 25 + (35 * built) / work.length);
      built += 1;
      const { node } = page;
      const stripped =
        node.parentId === null
          ? stripEaCodePrefix(node.name)
          : { title: node.name, code: null as string | null };
      const title = (stripped.title || node.name || 'Untitled').normalize(
        'NFC',
      );
      page.title = title;

      const imageHtmlById = await images.diagramImages(node, page.id, title);

      let html: string;
      if (node.documents.length > 0) {
        const converted = documentContent.get(node);
        html = await images.embedRtfImages(
          converted?.html ?? '',
          converted?.images ?? [],
          page.id,
          title,
        );
        // A page can carry both documents and diagrams (e.g. a wireframe
        // description attached to the diagram plus its exported image); keep
        // the diagram images instead of dropping them.
        for (const diagram of node.diagrams) {
          html += imageHtmlById.get(diagram.diagramId ?? diagram.name) ?? '';
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
      htmlByPage.set(page.id, html);
    });
    return htmlByPage;
  }

  /** Phase B (CPU bound): HTML -> ProseMirror -> Yjs on worker threads. */
  private async convertPages(
    work: PreparedPage[],
    htmlByPage: Map<string, string>,
    warnings: EaParseWarning[],
    taskId: string,
  ): Promise<void> {
    let converted = 0;
    const pageResults = await runEaCpuJobs(
      work.map((page) => ({
        kind: 'page' as const,
        id: page.id,
        html: htmlByPage.get(page.id)!,
        title: page.title,
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
  }

  /** Insert new pages and fill merge stubs in one transaction. */
  private async commitPages(
    work: PreparedPage[],
    merge: MergeTargets | null,
    scope: ImportScope,
  ): Promise<{ pageIds: string[]; rootPageIds: string[]; filledIds: string[] }> {
    const { spaceId, workspaceId, creatorId, rootParentId } = scope;
    const pageIds: string[] = [];
    const rootPageIds: string[] = [];
    const filledIds: string[] = [];
    const inserts = work.filter((page) => page.action === 'insert');
    const insertedIds = new Set(inserts.map((page) => page.id));

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
        const res = await trx
          .updateTable('pages')
          .set({
            content: page.content,
            textContent: jsonToText(page.content),
            ydoc: page.ydoc,
            lastUpdatedById: creatorId,
            updatedAt: new Date(),
          })
          .where('id', '=', page.id)
          .where('spaceId', '=', spaceId)
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

    return { pageIds, rootPageIds, filledIds };
  }

  /** Cumulative page map + stub hashes let the next merge find these pages. */
  private mergeBookkeeping(
    prepared: PreparedPage[],
    work: PreparedPage[],
    merge: MergeTargets | null,
    filledIds: string[],
  ): Pick<EaImportMetadata, 'pageMap' | 'stubHashes' | 'merge'> {
    const pageMap = { ...merge?.pageMap };
    const stubHashes = { ...merge?.stubHashes };
    const inserts = work.filter((page) => page.action === 'insert');
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
      pageMap,
      stubHashes,
      ...(merge && {
        merge: {
          added: inserts.length,
          filled: filledIds.length,
          kept: prepared.filter((page) => page.action === 'keep').length,
          skipped: prepared.filter((page) => page.action === 'skip').length,
        },
      }),
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
    userId: string,
  ): Promise<MergeTargets> {
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
    // Page-level permissions may have restricted part of the old tree since.
    const editable = await this.editablePageIds(
      rows.map((row) => row.id),
      userId,
    );

    const targets: MergeTargets['targets'] = new Map();
    const stubHashes: Record<string, string> = { ...metadata?.stubHashes };
    for (const [guid, id] of Object.entries(pageMap)) {
      const row = byId.get(id);
      if (!row) {
        continue;
      }
      targets.set(guid, { ...row, editable: editable.has(id) });
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

  /** Pages (of `pageIds`) the user may edit, honoring page-level permissions. */
  private async editablePageIds(
    pageIds: string[],
    userId: string,
  ): Promise<Set<string>> {
    const access =
      await this.pagePermissionRepo.filterAccessiblePageIdsWithPermissions(
        pageIds,
        userId,
      );
    return new Set(access.filter((page) => page.canEdit).map((p) => p.id));
  }

  /** Most recent successful EA import in this space with the same root signature. */
  private async findExistingImport(
    spaceId: string,
    workspaceId: string,
    eaRootId: string,
  ): Promise<ExistingImport | undefined> {
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
   * Replace semantics: move the previously imported page tree to the trash,
   * then neutralize the old task's signature so future imports are not
   * flagged as duplicates. Only roots still in this space that the importer
   * may edit are trashed; trashing (not permanent deletion) mirrors what a
   * space editor can do by hand. Runs after the new tree is committed;
   * failures become warnings, never thrown.
   */
  private async replaceExistingImport(
    existingImport: ExistingImport,
    scope: ImportScope,
    warnings: EaParseWarning[],
  ): Promise<void> {
    const { spaceId, workspaceId, creatorId } = scope;
    const rootPageIds = this.metadataStringArray(
      existingImport.metadata,
      'rootPageIds',
      'pageIds',
    );
    const live = rootPageIds.length
      ? await this.db
          .selectFrom('pages')
          .select(['id', 'title'])
          .where('id', 'in', rootPageIds)
          .where('spaceId', '=', spaceId)
          .where('deletedAt', 'is', null)
          .execute()
      : [];
    const editable = await this.editablePageIds(
      live.map((page) => page.id),
      creatorId,
    );

    for (const page of live) {
      if (!editable.has(page.id)) {
        warnings.push({
          page: page.title ?? '',
          reason: 'Previous import page is restricted; it was not replaced',
        });
        continue;
      }
      try {
        await this.pageService.removePage(page.id, creatorId, workspaceId);
        await this.auditService.log({
          event: AuditEvent.PAGE_TRASHED,
          resourceType: AuditResource.PAGE,
          resourceId: page.id,
          spaceId,
          metadata: { source: EA_SOURCE, reason: 'replace' },
        });
      } catch (error) {
        this.logger.error(
          `Failed to trash replaced EA page ${page.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    try {
      await this.db
        .updateTable('fileTasks')
        .set({ metadata: sql`metadata - 'eaRootId'` as any })
        .where('id', '=', existingImport.id)
        .execute();
    } catch (error) {
      this.logger.error(
        `Failed to clear replaced EA task signature ${existingImport.id}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
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
