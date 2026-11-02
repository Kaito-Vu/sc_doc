import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { assertCanManageWorkspace } from '../common/workspace-admin';
import { UpdateWorkspaceLocaleDto } from './workspace-locale.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspace-locale')
export class WorkspaceLocaleController {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  // Stores defaultLocale / forceLocale in workspaces.settings (jsonb). The
  // client enforces them; no per-user rows are rewritten, so un-forcing
  // restores each user's own choice.
  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() dto: UpdateWorkspaceLocaleDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    assertCanManageWorkspace(this.workspaceAbility, user, workspace);
    const patch: Record<string, unknown> = {};
    if (dto.defaultLocale !== undefined) patch.defaultLocale = dto.defaultLocale;
    if (dto.forceLocale !== undefined) patch.forceLocale = dto.forceLocale;

    const row = await this.db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb) || ${JSON.stringify(patch)}::text::jsonb`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspace.id)
      .returning('settings')
      .executeTakeFirst();
    return row?.settings ?? {};
  }
}
