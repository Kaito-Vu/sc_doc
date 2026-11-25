import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { MailService } from '../../integrations/mail/mail.service';
import { SmtpDriver } from '../../integrations/mail/drivers';
import { decryptSecret, encryptSecret } from '../sso/secret-cipher';
import { UpdateMailSettingsDto } from './dto/update-mail-settings.dto';

// Stored in mail_settings.config; `password` is encrypted (enc:...).
interface StoredMailConfig {
  fromAddress: string;
  fromName: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  secure: boolean;
  ignoreTLS: boolean;
}

export interface MailSettingsView extends Omit<StoredMailConfig, 'password'> {
  configured: boolean;
  hasPassword: boolean;
}

type Resolved = { driver: SmtpDriver; from: string; fromName: string };

const CACHE_TTL_MS = 30_000; // other instances pick up changes within this

@Injectable()
export class MailSettingsService implements OnModuleInit {
  private cache?: { at: number; value: Resolved | null };

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly env: EnvironmentService,
    private readonly mailService: MailService,
  ) {}

  onModuleInit() {
    this.mailService.resolveConfig = () => this.resolve();
  }

  private async load(workspaceId: string): Promise<StoredMailConfig | null> {
    const { rows } = await sql<{ config: StoredMailConfig }>`
      SELECT config FROM mail_settings WHERE workspace_id = ${workspaceId}
    `.execute(this.db);
    return rows[0]?.config ?? null;
  }

  async get(workspace: Workspace): Promise<MailSettingsView> {
    const c = await this.load(workspace.id);
    return {
      configured: !!c,
      fromAddress: c?.fromAddress ?? '',
      fromName: c?.fromName ?? 'Docmost',
      host: c?.host ?? '',
      port: c?.port ?? 587,
      username: c?.username ?? '',
      secure: c?.secure ?? false,
      ignoreTLS: c?.ignoreTLS ?? false,
      hasPassword: !!c?.password,
    };
  }

  async update(workspace: Workspace, dto: UpdateMailSettingsDto) {
    const prev = await this.load(workspace.id);
    let password = prev?.password;
    if (dto.password === null) password = undefined;
    else if (dto.password) {
      password = encryptSecret(dto.password, this.env.getAppSecret());
    }
    const config: StoredMailConfig = {
      fromAddress: dto.fromAddress,
      fromName: dto.fromName?.trim() || 'Docmost',
      host: dto.host.trim(),
      port: dto.port,
      username: dto.username ?? '',
      password,
      secure: dto.secure,
      ignoreTLS: dto.ignoreTLS,
    };
    await sql`
      INSERT INTO mail_settings (workspace_id, config, updated_at)
      VALUES (${workspace.id}, ${JSON.stringify(config)}::text::jsonb, now())
      ON CONFLICT (workspace_id)
      DO UPDATE SET config = EXCLUDED.config, updated_at = now()
    `.execute(this.db);
    this.cache = undefined;
    return this.get(workspace);
  }

  async remove(workspace: Workspace) {
    await sql`DELETE FROM mail_settings WHERE workspace_id = ${workspace.id}`.execute(
      this.db,
    );
    this.cache = undefined;
    return this.get(workspace);
  }

  async sendTest(workspace: Workspace, to: string) {
    const c = await this.load(workspace.id);
    if (!c) throw new BadRequestException('SMTP is not configured');
    try {
      await this.build(c).driver.sendMail({
        from: `${c.fromName} <${c.fromAddress}>`,
        to,
        subject: 'SMTP test',
        text: 'SMTP settings work.',
        html: '<p>SMTP settings work.</p>',
      });
    } catch (err) {
      throw new BadRequestException(String((err as Error).message ?? err));
    }
  }

  // Used by MailService; null = nothing saved, fall back to the default driver.
  private async resolve(): Promise<Resolved | null> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.value;
    }
    // ponytail: single-workspace deployment, so the only row owns the mail config
    const { rows } = await sql<{ config: StoredMailConfig }>`
      SELECT config FROM mail_settings LIMIT 1
    `.execute(this.db);
    const value = rows[0] ? this.build(rows[0].config) : null;
    this.cache = { at: Date.now(), value };
    return value;
  }

  private build(c: StoredMailConfig): Resolved {
    const auth =
      c.username && c.password
        ? {
            user: c.username,
            pass: decryptSecret(c.password, this.env.getAppSecret()),
          }
        : undefined;
    return {
      driver: new SmtpDriver({
        host: c.host,
        port: c.port,
        connectionTimeout: 30 * 1000,
        auth,
        secure: c.secure,
        ignoreTLS: c.ignoreTLS,
      }),
      from: c.fromAddress,
      fromName: c.fromName,
    };
  }
}
