import { Inject, Injectable, Logger } from '@nestjs/common';
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
import { parseEaXmi } from './ea-xmi.parser';
import { isBpmnDocument, parseEaBpmn } from './ea-bpmn.parser';
import { isEaNativeDocument, parseEaNative } from './ea-native.parser';
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
import { EA_IMPORT_JOB, EA_IMPORT_QUEUE } from './ea-import.constants';
import { eaRootSignature } from './ea-import.util';

const EA_SOURCE = 'ea';

/** Duplicate-import resolution chosen by the user in the client dialog. */
export type EaImportMode = 'replace' | 'keep';

const MAX_PAGES = 300;
const MAX_TOTAL_RTF_BYTES = 96 * 1024 * 1024;
const MAX_SINGLE_DOC_BYTES = 32 * 1024 * 1024;
const MAX_IMAGES = 200;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 64 * 1024 * 1024;

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
}

interface PreparedPage {
  node: EaPackageNode;
  id: string;
  parentPageId: string | null;
  title: string;
  content: any;
  ydoc: Buffer | null;
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
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await this.eaImportQueue.add(EA_IMPORT_JOB, { fileTaskId, mode });

    return fileTask;
  }

  /**
   * Worker entry point: read the stored file, run the import, then record the
   * result on the task and remove the stored file.
   */
  async processEaImportTask(
    fileTaskId: string,
    mode?: EaImportMode,
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
      fileTask.status === FileTaskStatus.Failed
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
      });

      await this.db
        .updateTable('fileTasks')
        .set({
          status: FileTaskStatus.Success,
          errorMessage: null,
          metadata: { source: EA_SOURCE, ...metadata } as any,
          updatedAt: new Date(),
        })
        .where('id', '=', fileTaskId)
        .execute();

      await this.deleteStoredFile(fileTask.filePath);
    } catch (error) {
      await this.markTaskFailed(fileTaskId, errorMessage(error));
      if (fileTask.filePath) {
        await this.deleteStoredFile(fileTask.filePath);
      }
      throw error;
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
   * Parse an EA export buffer, dispatching on whether it is a native EA table
   * export, BPMN 2.0 XML or an XMI/UML model, and surfacing parse failures
   * with a clear message.
   */
  private parseDocument(buffer: Buffer): EaParseResult {
    try {
      if (isEaNativeDocument(buffer)) {
        return parseEaNative(buffer);
      }
      return isBpmnDocument(buffer) ? parseEaBpmn(buffer) : parseEaXmi(buffer);
    } catch (error) {
      throw new Error(
        `Invalid Enterprise Architect file: ${errorMessage(error)}`,
      );
    }
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
  }): Promise<{ result: EaImportResult; metadata: EaImportMetadata }> {
    const { buffer, fileName, workspaceId, spaceId, creatorId, mode } = opts;

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
          spaceId,
          workspaceId,
          creatorId,
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

      parsed = this.parseDocument(inspection.xmi);
      byKey = new Map(
        inspection.images.map((image) => [
          normalizeAssetKey(image.fileName),
          image,
        ]),
      );
    } else {
      parsed = this.parseDocument(buffer);
    }

    const warnings: EaParseWarning[] = [...parsed.warnings];

    if (parsed.roots.length === 0) {
      throw new Error('No importable Enterprise Architect content found');
    }

    const eaRootId = eaRootSignature(parsed.roots);

    const existingImport = eaRootId
      ? await this.findExistingImport(spaceId, workspaceId, eaRootId)
      : undefined;

    if (existingImport && !mode) {
      this.logger.log(
        `Skipping EA import: root signature ${eaRootId} already imported in space ${spaceId}`,
      );
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
    const queue: Array<{ node: EaPackageNode; parent: EaPackageNode | null }> =
      parsed.roots.map((node) => ({ node, parent: null }));

    while (queue.length > 0) {
      const { node, parent } = queue.shift()!;
      const id = v7();
      pageIdByNode.set(node, id);
      prepared.push({
        node,
        id,
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

    if (prepared.length > MAX_PAGES) {
      throw new Error(
        `Import exceeds the ${MAX_PAGES} page limit (found ${prepared.length}); export a smaller EA package.`,
      );
    }

    const documentContent = await this.convertDocuments(prepared, warnings);

    const imageBudget = { count: 0, bytes: 0 };

    for (const page of prepared) {
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

      try {
        const prosemirrorJson = await this.importService.processHTML(html);
        const content = stripDuplicateLeadingHeading(prosemirrorJson, title);
        page.title = title;
        page.content = content;
        page.ydoc = await this.importService.createYdoc(content);
      } catch (error) {
        warnings.push({
          page: title,
          reason: `Failed to convert page content: ${errorMessage(error)}`,
        });
        page.title = title;
        page.content = {
          type: 'doc',
          content: [{ type: 'paragraph', content: [] }],
        };
        try {
          page.ydoc = await this.importService.createYdoc(page.content);
        } catch {
          page.ydoc = null;
        }
      }
    }

    const pageIds: string[] = [];
    const rootPageIds: string[] = [];

    await executeTx(this.db, async (trx) => {
      for (const page of prepared) {
        const position = await this.pageService.nextPagePosition(
          spaceId,
          page.parentPageId ?? undefined,
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
          parentPageId: page.parentPageId,
        };

        await trx.insertInto('pages').values(insertable).execute();
        pageIds.push(page.id);
        if (page.parentPageId === null) {
          rootPageIds.push(page.id);
        }
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
      `Imported ${pageIds.length} EA pages (${warnings.length} warnings)`,
    );

    return {
      result: {
        pageIds,
        rootPageIds,
        pageCount: pageIds.length,
        warnings,
      },
      metadata: {
        eaRootId,
        pageIds,
        rootPageIds,
        pageCount: pageIds.length,
        warnings,
      },
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
      const asset =
        resolveImageForDiagram(diagram, byKey) ?? diagram.embeddedImage;
      if (!asset) {
        continue;
      }

      const key = diagram.diagramId ?? diagram.name;
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
