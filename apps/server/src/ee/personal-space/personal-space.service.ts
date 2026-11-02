import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceService } from '../../core/space/services/space.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { User } from '@docmost/db/types/entity.types';
import { sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import slugify from '@sindresorhus/slugify';
import { AuthAccountRepo } from '../sso/auth-account.repo';

@Injectable()
export class PersonalSpaceService {
  constructor(
    private readonly spaceRepo: SpaceRepo,
    private readonly spaceService: SpaceService,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly authAccountRepo: AuthAccountRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async getInfo(user: User, workspaceId: string) {
    const space = await this.spaceRepo.findPersonalSpace(user.id, workspaceId);
    return space ?? null;
  }

  async create(user: User, workspaceId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    const settings = (workspace?.settings ?? {}) as Record<string, any>;
    if (!settings?.spaces?.allowPersonal) {
      throw new ForbiddenException('Personal spaces are not enabled');
    }

    const row = await this.db
      .selectFrom('users')
      .select('settings')
      .where('id', '=', user.id)
      .executeTakeFirst();
    if ((row?.settings as any)?.personalSpaceRevoked) {
      throw new ForbiddenException('Personal space access was revoked');
    }

    const existing = await this.spaceRepo.findPersonalSpace(
      user.id,
      workspaceId,
    );
    if (existing) {
      throw new BadRequestException('Personal space already exists');
    }

    // display name is always "Personal Space"; slug encodes the login
    // provider + username (e.g. "entraid-vuna") so it stays unique and
    // stable across a workspace's members regardless of display name
    const name = 'Personal Space';

    const authAccount = await this.authAccountRepo.findByUserId(
      user.id,
      workspaceId,
    );
    const providerSlug =
      slugify(authAccount?.providerName ?? '', { lowercase: true }) ||
      'local';
    const username =
      slugify(user.email.split('@')[0], { lowercase: true }) || 'user';

    let slug = `${providerSlug}-${username}`;

    let suffix = 0;
    while (await this.spaceRepo.slugExists(slug, workspaceId)) {
      suffix += 1;
      slug = `${providerSlug}-${username}-${suffix}`;
    }

    return this.spaceService.createSpace(
      user,
      workspaceId,
      { name, slug, description: '' },
      undefined,
      { isPersonal: true },
    );
  }

  // Deletes the user's personal space (pages cascade, attachments are pruned
  // by the queue job) and blocks re-creation until restored.
  async revoke(userId: string, workspaceId: string) {
    const space = await this.spaceRepo.findPersonalSpace(userId, workspaceId);
    if (space) await this.spaceService.deleteSpace(space.id, workspaceId);
    await this.setRevoked(userId, workspaceId, true);
  }

  async setRevoked(userId: string, workspaceId: string, revoked: boolean) {
    await sql`UPDATE users SET settings = ${
      revoked
        ? sql`jsonb_set(coalesce(settings, '{}'::jsonb), '{personalSpaceRevoked}', 'true'::jsonb)`
        : sql`settings - 'personalSpaceRevoked'`
    } WHERE id = ${userId} AND workspace_id = ${workspaceId}`.execute(this.db);
  }
}
