import { Injectable, NotFoundException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { User } from '@docmost/db/types/entity.types';
import { getProsemirrorContent } from '../../common/helpers/prosemirror/utils';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from 'docx';
import * as JSZip from 'jszip';
import { sanitizeFileName } from '../../common/helpers';
import { jsonToText } from '../../collaboration/collaboration.util';

@Injectable()
export class DocxExportService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
  ) {}

  /** Returns a .docx buffer, or a .zip of .docx files when exporting subpages as separate files. */
  async exportPages(
    pageId: string,
    user: User,
    opts: { includeChildren?: boolean; singleFile?: boolean },
  ): Promise<{ buffer: Buffer; ext: 'docx' | 'zip'; title: string }> {
    const root = await this.pageRepo.findById(pageId, { includeContent: true });
    if (!root || root.deletedAt) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(root, user);

    const title = root.title || 'Untitled';
    if (!opts.includeChildren) {
      return {
        buffer: await this.toDocx([{ page: root, level: 1 }]),
        ext: 'docx',
        title,
      };
    }

    const all: any[] = await this.pageRepo.getPageAndDescendants(pageId, {
      includeContent: true,
    });
    const byParent = new Map<string, any[]>();
    for (const p of all) {
      const list = byParent.get(p.parentPageId) ?? [];
      list.push(p);
      byParent.set(p.parentPageId, list);
    }
    const items: { page: any; level: number }[] = [];
    const walk = async (page: any, level: number) => {
      try {
        await this.pageAccessService.validateCanView(page, user);
      } catch {
        return; // skip pages (and their subtree) the user cannot view
      }
      items.push({ page, level });
      const kids = (byParent.get(page.id) ?? []).sort((a, b) =>
        a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
      );
      for (const k of kids) await walk(k, level + 1);
    };
    await walk(all.find((p) => p.id === pageId), 1);

    if (opts.singleFile) {
      return { buffer: await this.toDocx(items), ext: 'docx', title };
    }

    const zip = new JSZip();
    const pad = String(items.length).length;
    for (const [i, it] of items.entries()) {
      const name = sanitizeFileName(it.page.title || 'Untitled', {
        preserveSpaces: true,
      });
      zip.file(
        `${String(i + 1).padStart(pad, '0')} - ${name}.docx`,
        await this.toDocx([{ page: it.page, level: 1 }]),
      );
    }
    return {
      buffer: await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      }),
      ext: 'zip',
      title,
    };
  }

  private toDocx(items: { page: any; level: number }[]): Promise<Buffer> {
    const headings = [
      HeadingLevel.HEADING_1,
      HeadingLevel.HEADING_2,
      HeadingLevel.HEADING_3,
      HeadingLevel.HEADING_4,
      HeadingLevel.HEADING_5,
      HeadingLevel.HEADING_6,
    ];
    const children = items.flatMap(({ page, level }) => {
      const bodyText =
        jsonToText(getProsemirrorContent(page.content)) ||
        page.textContent ||
        '';
      return [
        new Paragraph({
          heading: headings[Math.min(level, 6) - 1],
          children: [new TextRun(page.title || 'Untitled')],
        }),
        ...bodyText
          .split(/\n+/)
          .filter(Boolean)
          .map((line) => new Paragraph({ children: [new TextRun(line)] })),
      ];
    });
    return Packer.toBuffer(new Document({ sections: [{ children }] }));
  }
}
