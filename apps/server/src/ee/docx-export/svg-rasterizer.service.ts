import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';
import { withPngDpi } from './image-size';
import { DIAGRAM_CACHE_INDEX } from './docx-export.constants';
import { StorageService } from '../../integrations/storage/storage.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';

const SCALE = 2;
// Chromium is the scarce resource: cap concurrent renders across ALL exports.
const MAX_RENDERS = Number(process.env.DOCX_RENDER_CONCURRENCY) || 2;
const RENDER_TIMEOUT_MS = 60_000;
// Caps the screenshot viewport: SVG width/height are user-controlled.
const MAX_RENDER_PX = 8000;
/**
 * The SVG is an uploaded attachment rendered by Gotenberg's Chromium, which can
 * reach the internal network. Block scripts and every outbound load (SSRF /
 * exfiltration via <script>, <image href>, <foreignObject><iframe>, CSS url()).
 */
const SVG_CSP =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
  `style-src 'unsafe-inline'; img-src data:; font-src data:">`;
/** Mermaid needs its bundled script; still no network, frames or remote images. */
const MERMAID_CSP =
  `<meta http-equiv="Content-Security-Policy" content="connect-src 'none'; ` +
  `frame-src 'none'; object-src 'none'; img-src data:; font-src data:">`;
let mermaidJs: Buffer | undefined;

/** Renders SVG (e.g. draw.io diagrams, which rely on foreignObject text) to PNG via Gotenberg's Chromium. */
@Injectable()
export class SvgRasterizerService {
  private readonly logger = new Logger(SvgRasterizerService.name);

  private readonly redis: Redis;
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(
    private readonly env: EnvironmentService,
    private readonly storage: StorageService,
    redisService: RedisService,
  ) {
    this.redis = redisService.getOrThrow();
  }

  static isSvg(buf: Uint8Array): boolean {
    return Buffer.from(buf.subarray(0, 1024)).toString('utf8').includes('<svg');
  }

  /** SVG -> PNG, cached. */
  toPng(svg: Buffer): Promise<Buffer> {
    return this.cached(createHash('sha256').update(svg).digest('hex'), () =>
      this.render(svg),
    );
  }

  /** Mermaid source -> PNG, cached. Rendered by mermaid.js inside Gotenberg's Chromium. */
  mermaidToPng(code: string): Promise<Buffer> {
    return this.cached(
      createHash('sha256')
        .update('mermaid:' + code)
        .digest('hex'),
      () => this.renderMermaid(code),
    );
  }

  /** PNG cached in storage by hash. */
  private async cached(
    hash: string,
    produce: () => Promise<Buffer>,
  ): Promise<Buffer> {
    const key = `cache/docx-diagram/v2/${hash}.png`;
    try {
      if (await this.storage.exists(key)) {
        await this.touch(key);
        return await this.storage.read(key);
      }
    } catch {
      // cache is best-effort
    }
    const png = await produce();
    await this.storage
      .upload(key, png)
      .then(() => this.touch(key))
      .catch(() => undefined);
    return png;
  }

  private async acquire() {
    if (this.active < MAX_RENDERS) {
      this.active++;
      return;
    }
    // The releasing caller hands its slot straight to us, so `active` is unchanged.
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active--;
  }

  /** Records last use so the cleanup job can expire the entry. */
  private touch(key: string) {
    return this.redis.zadd(DIAGRAM_CACHE_INDEX, Date.now(), key);
  }

  private async render(svg: Buffer): Promise<Buffer> {
    const text = svg.toString('utf8');
    const { width, height } = this.dimensions(text);
    const fit = Math.min(1, MAX_RENDER_PX / (Math.max(width, height) * SCALE));
    const w = Math.max(1, Math.ceil(width * SCALE * fit));
    const h = Math.max(1, Math.ceil(height * SCALE * fit));
    // Force the root <svg> to the scaled size so the screenshot is crisp.
    const sized = text
      .replace(/<\?xml[^>]*\?>/, '')
      .replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
        const rest = attrs
          .replace(/\s(width|height)="[^"]*"/g, '')
          .replace(/\sstyle="[^"]*"/, '');
        const vb = /viewBox=/.test(rest)
          ? ''
          : ` viewBox="0 0 ${width} ${height}"`;
        return `<svg${rest}${vb} width="${w}" height="${h}">`;
      });
    const html = `<!doctype html><html><head>${SVG_CSP}</head><body style="margin:0;background:#fff">${sized}</body></html>`;

    // Rendered at SCALE x for sharpness; the density tells Word the logical (1x) size.
    return withPngDpi(
      await this.screenshot(
        [{ name: 'index.html', data: html, type: 'text/html' }],
        { width: String(w), height: String(h) },
      ),
      96 * SCALE,
    );
  }

  private async renderMermaid(code: string): Promise<Buffer> {
    mermaidJs ??= readFileSync(require.resolve('mermaid/dist/mermaid.min.js'));
    const esc = code.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    // Full-page screenshot sizes itself to the content, so use a narrow
    // viewport and non-responsive diagrams. On a syntax error the source is shown instead.
    const html = `<!doctype html><html><head>${MERMAID_CSP}</head><body style="margin:0;padding:16px;background:#fff">
<pre class="mermaid" id="m">${esc}</pre>
<script src="mermaid.min.js"></script>
<script>
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { useMaxWidth: false }, sequence: { useMaxWidth: false }, gantt: { useMaxWidth: false } });
mermaid.run({ nodes: [document.getElementById('m')], suppressErrors: false })
  .catch(function () { var m = document.getElementById('m'); m.className = ''; m.style.font = '12px monospace'; })
  .then(function () { window.__done = true; });
</script></body></html>`;
    return this.screenshot(
      [
        { name: 'index.html', data: html, type: 'text/html' },
        { name: 'mermaid.min.js', data: mermaidJs, type: 'text/javascript' },
      ],
      {
        width: '200',
        height: '100',
        waitForExpression: 'window.__done === true',
      },
    );
  }

  private async screenshot(
    files: { name: string; data: string | Buffer; type: string }[],
    fields: Record<string, string>,
  ): Promise<Buffer> {
    const url = this.env.getGotenbergUrl();
    if (!url) {
      throw new Error('GOTENBERG_URL is not set; cannot render diagram');
    }
    const form = new FormData();
    for (const f of files) {
      form.append(
        'files',
        new Blob(
          [typeof f.data === 'string' ? f.data : new Uint8Array(f.data)],
          { type: f.type },
        ),
        f.name,
      );
    }
    form.append('format', 'png');
    for (const [k, v] of Object.entries(fields)) form.append(k, v);

    await this.acquire();
    let res: Response;
    try {
      res = await fetch(
        `${url.replace(/\/$/, '')}/forms/chromium/screenshot/html`,
        {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
        },
      );
    } finally {
      this.release();
    }
    if (!res.ok) {
      this.logger.warn(`Gotenberg screenshot failed: ${res.status}`);
      throw new Error(`Gotenberg screenshot failed: ${res.status}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private dimensions(svg: string): { width: number; height: number } {
    const tag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
    const attr = (n: string) => {
      const m = new RegExp(`\\s${n}="([\\d.]+)(?:px)?"`).exec(tag);
      return m ? parseFloat(m[1]) : undefined;
    };
    const vb = /viewBox="[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/.exec(
      tag,
    );
    return {
      width: attr('width') ?? (vb ? parseFloat(vb[1]) : 800),
      height: attr('height') ?? (vb ? parseFloat(vb[2]) : 600),
    };
  }
}
