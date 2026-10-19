import { createHash } from 'crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { User } from '@docmost/db/types/entity.types';
import { getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import { pageNodeToDocxBuffer } from '@docmost/editor-ext';
import * as JSZip from 'jszip';
import { sanitizeFileName } from '../../common/helpers';
import { jsonToNode } from '../../collaboration/collaboration.util';
import { AttachmentRepo } from '@docmost/db/repos/attachment/attachment.repo';
import { StorageService } from '../../integrations/storage/storage.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SvgRasterizerService } from './svg-rasterizer.service';
import { addToc, TocEntry } from './docx-toc';
import { fitDocx } from './docx-fit';
import { withColumnWidths } from './docx-table-widths';
import { DocxExportOptions } from './docx-export.constants';

const RASTER_EXT = new Set(['png', 'gif', 'bmp']);
const LINK_NODES = new Set(['video', 'audio', 'pdf', 'attachment']);
const IMAGE_CONCURRENCY = 4;
const MERMAID_RE = /\/mermaid\/([0-9a-f]{40})\./;
const FILE_ID_RE = /\/files\/([0-9a-f-]{36})\//gi;

/** Runs fn over items with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}
const swapExt = (src: string, ext: string) =>
  src.replace(/\.[^./?]+$/, '') + '.' + ext;

interface PreparedPage {
  title: string;
  level: number;
  nodes: any[];
  /** sha1 -> mermaid source of this page's diagrams. */
  mermaid: Map<string, string>;
}

@Injectable()
export class DocxExportService {
  private readonly logger = new Logger(DocxExportService.name);

  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly attachmentRepo: AttachmentRepo,
    private readonly storageService: StorageService,
    private readonly env: EnvironmentService,
    private readonly rasterizer: SvgRasterizerService,
  ) {}

  /**
   * The page and (optionally) its viewable descendants in export order. Pages the
   * user cannot view are skipped together with their subtree. One permission query
   * for the whole tree instead of a check per page.
   */
  private async collectTree(
    root: any,
    user: User,
    opts: { includeContent: boolean; order?: string[]; exclude?: string[] },
  ): Promise<{ page: any; level: number }[]> {
    const all: any[] = await this.pageRepo.getPageAndDescendants(root.id, {
      includeContent: opts.includeContent,
    });
    const accessible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: all.map((p) => p.id),
        userId: user.id,
        spaceId: root.spaceId,
      }),
    );
    const exclude = new Set(opts.exclude);
    const rank = new Map((opts.order ?? []).map((id, i) => [id, i]));
    const byParent = new Map<string, any[]>();
    for (const p of all) {
      const list = byParent.get(p.parentPageId) ?? [];
      list.push(p);
      byParent.set(p.parentPageId, list);
    }
    const bySiblingOrder = (a: any, b: any) =>
      rank.has(a.id) && rank.has(b.id)
        ? rank.get(a.id) - rank.get(b.id)
        : a.position < b.position
          ? -1
          : a.position > b.position
            ? 1
            : 0;
    const items: { page: any; level: number }[] = [];
    const walk = (page: any, level: number) => {
      if (
        page.id !== root.id &&
        (!accessible.has(page.id) || exclude.has(page.id))
      ) {
        return;
      }
      items.push({ page, level });
      for (const k of (byParent.get(page.id) ?? []).sort(bySiblingOrder)) {
        walk(k, level + 1);
      }
    };
    walk(all.find((p) => p.id === root.id) ?? root, 1);
    return items;
  }

  /** Loads the export root, scoped to the user's workspace, and checks view access. */
  private async getRootOrThrow(
    pageId: string,
    user: User,
    includeContent = false,
  ) {
    const root = await this.pageRepo.findById(pageId, { includeContent });
    if (!root || root.deletedAt || root.workspaceId !== user.workspaceId) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(root, user);
    return root;
  }

  /** Flat, ordered subpage list for the export dialog's reorder UI. */
  async listTree(pageId: string, user: User) {
    const root = await this.getRootOrThrow(pageId, user);
    const items = await this.collectTree(root, user, { includeContent: false });
    return items.map(({ page, level }) => ({
      id: page.id,
      title: page.title || 'Untitled',
      level,
    }));
  }

  /** Returns a .docx buffer, or a .zip stream of .docx files when exporting subpages as separate files. */
  async exportPages(
    pageId: string,
    user: User,
    opts: DocxExportOptions,
  ): Promise<{ body: Buffer; ext: 'docx' | 'zip'; title: string }> {
    const root = await this.getRootOrThrow(pageId, user, true);

    const title = root.title || 'Untitled';
    const multiFile = !!opts.includeChildren && !opts.singleFile;
    const items: { page: any; level: number }[] = opts.includeChildren
      ? await this.collectTree(root, user, {
          includeContent: true,
          order: opts.order,
          exclude: opts.exclude,
        })
      : [{ page: root, level: 1 }];

    const appUrl = this.env.getAppUrl();
    const prepared: PreparedPage[] = items.map(({ page, level }) => {
      const mermaid = new Map<string, string>();
      const nodes = (getProsemirrorContent(page.content)?.content ?? []).map(
        (n: any) => this.prepareNode(n, multiFile ? 1 : level, appUrl, mermaid),
      );
      return { title: page.title || 'Untitled', level, nodes, mermaid };
    });
    const allowedPageIds = new Set(items.map((i) => i.page.id));
    const build = (parts: PreparedPage[]) =>
      this.buildDocx(parts, allowedPageIds, opts);

    if (!multiFile) return { body: await build(prepared), ext: 'docx', title };

    const zip = new JSZip();
    const pad = String(prepared.length).length;
    for (const [i, p] of prepared.entries()) {
      const name = sanitizeFileName(p.title, { preserveSpaces: true });
      zip.file(
        `${String(i + 1).padStart(pad, '0')} - ${name}.docx`,
        await build([{ ...p, level: 1 }]),
      );
    }
    const body = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    return { body, ext: 'zip', title };
  }

  /**
   * One .docx for the given pages, with a ToC when requested (single file and
   * each zip entry alike). Images are fetched per call, so a multi-file export
   * only holds one page's images in memory at a time.
   */
  private async buildDocx(
    parts: PreparedPage[],
    allowedPageIds: Set<string>,
    opts: DocxExportOptions,
  ): Promise<Buffer> {
    const images = await this.prefetchImages(parts, allowedPageIds);
    const toc = !!opts.toc;
    // Every page after the first starts on a new sheet; with a ToC the first one does too.
    const docx = await pageNodeToDocxBuffer(
      jsonToNode({
        type: 'doc',
        content: parts.flatMap((p, i) => [
          ...(i > 0 || toc ? [{ type: 'pageBreak' }] : []),
          {
            type: 'heading',
            attrs: { level: Math.min(p.level, 6) },
            content: [{ type: 'text', text: p.title }],
          },
          ...p.nodes,
        ]),
      } as any),
      (src: string) => this.imageFrom(images, src),
    );
    const buf = await fitDocx(docx);
    return toc
      ? addToc(buf, this.tocEntries(parts), opts.tocTitle || 'Table of contents')
      : buf;
  }

  /** Page titles and body headings (levels 1-3) for the table of contents. */
  private tocEntries(parts: { title: string; level: number; nodes: any[] }[]) {
    const text = (n: any): string =>
      n.text ?? (n.content ?? []).map(text).join('');
    const entries: TocEntry[] = [];
    for (const p of parts) {
      entries.push({ level: Math.min(p.level, 3), text: p.title });
      for (const n of p.nodes) {
        if (n.type === 'heading' && n.attrs?.level <= 3 && text(n).trim()) {
          entries.push({ level: n.attrs.level, text: text(n) });
        }
      }
    }
    return entries;
  }

  /** Batch-loads every image of the export (one DB query, bounded parallel reads/renders). */
  private async prefetchImages(
    pages: PreparedPage[],
    allowedPageIds: Set<string>,
  ): Promise<Map<string, Buffer>> {
    const mermaid = new Map(pages.flatMap((p) => [...p.mermaid]));
    const json = JSON.stringify(pages.map((p) => p.nodes));
    const ids = [...new Set([...json.matchAll(FILE_ID_RE)].map((m) => m[1]))];
    const atts = (await this.attachmentRepo.findByIds(ids)).filter(
      (a) => a.pageId && allowedPageIds.has(a.pageId),
    );
    const out = new Map<string, Buffer>();
    await pool([...mermaid], IMAGE_CONCURRENCY, async ([hash, code]) => {
      try {
        out.set(hash, await this.rasterizer.mermaidToPng(code));
      } catch (err) {
        this.logger.warn(`docx export: mermaid diagram skipped: ${err}`);
      }
    });
    await pool(atts, IMAGE_CONCURRENCY, async (att) => {
      try {
        const buf = await this.storageService.read(att.filePath);
        out.set(
          att.id,
          SvgRasterizerService.isSvg(buf)
            ? await this.rasterizer.toPng(buf)
            : buf,
        );
      } catch (err) {
        // Missing/unrenderable image: serializer skips it.
        this.logger.warn(`docx export: skipped attachment ${att.id}: ${err}`);
      }
    });
    return out;
  }

  private imageFrom(images: Map<string, Buffer>, src: string): Buffer {
    const id =
      MERMAID_RE.exec(src)?.[1] ??
      new RegExp(FILE_ID_RE.source, 'i').exec(src)?.[1];
    const buf = id && images.get(id);
    if (!buf) throw new Error(`Image not available: ${src}`);
    return buf;
  }

  /**
   * Rewrites nodes the serializer can't render well, so editor-ext stays untouched:
   * diagrams -> png image, embeds/files -> clickable link, headings shifted under the page title.
   */
  private prepareNode(
    n: any,
    shift: number,
    appUrl: string,
    mermaid: Map<string, string>,
  ): any {
    const src: string | undefined = n.attrs?.src;
    const link = (href: string, text: string) => ({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: text || href,
          marks: [{ type: 'link', attrs: { href } }],
        },
      ],
    });

    if (n.type === 'codeBlock' && n.attrs?.language === 'mermaid') {
      const code = (n.content ?? []).map((c: any) => c.text ?? '').join('');
      if (code.trim()) {
        const hash = createHash('sha1').update(code).digest('hex');
        mermaid.set(hash, code);
        return { type: 'image', attrs: { src: `/mermaid/${hash}.png` } };
      }
    }
    if (n.type === 'table') {
      return withColumnWidths({
        ...n,
        content: (n.content ?? []).map((c: any) =>
          this.prepareNode(c, shift, appUrl, mermaid),
        ),
      });
    }
    if (n.type === 'heading') {
      const level = Math.min(6, (n.attrs?.level ?? 1) + shift);
      return { ...n, attrs: { ...n.attrs, level } };
    }
    if (n.type === 'drawio' || n.type === 'excalidraw') {
      return src
        ? { type: 'image', attrs: { ...n.attrs, src: swapExt(src, 'png') } }
        : n;
    }
    if (n.type === 'image' && src) {
      const ext = /\.([^./?]+)$/.exec(src)?.[1]?.toLowerCase();
      if (ext === 'jpeg')
        return { ...n, attrs: { ...n.attrs, src: swapExt(src, 'jpg') } };
      if (ext && ext !== 'jpg' && !RASTER_EXT.has(ext)) {
        return { ...n, attrs: { ...n.attrs, src: swapExt(src, 'png') } };
      }
      return n;
    }
    if ((n.type === 'embed' || n.type === 'youtube') && src) {
      return link(src, '');
    }
    if (LINK_NODES.has(n.type) && src) {
      return link(
        /^https?:/.test(src) ? src : appUrl + src,
        n.attrs?.name || src,
      );
    }
    return n.content
      ? {
          ...n,
          content: n.content.map((c: any) =>
            this.prepareNode(c, shift, appUrl, mermaid),
          ),
        }
      : n;
  }
}
