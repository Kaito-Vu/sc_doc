import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PersonalSpaceService } from './personal-space.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { PersonalSpaceQuotaService } from './personal-space-quota.service';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import * as bytes from 'bytes';
import { assertCanManageWorkspace } from '../common/workspace-admin';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { Feature } from '../../common/features';

class UserIdDto {
  @IsUUID()
  userId: string;
}

class SetQuotaDto {
  // omit userId to set the workspace-wide default
  @IsOptional()
  @IsUUID()
  userId?: string;

  // size string like "500mb" / "2gb"; null clears the override
  @IsOptional()
  @IsString()
  limit?: string | null;
}

@UseGuards(JwtAuthGuard)
@Controller('personal-space')
export class PersonalSpaceController {
  constructor(
    private readonly personalSpaceService: PersonalSpaceService,
    private readonly quota: PersonalSpaceQuotaService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('usage')
  @RequireFeature(Feature.PERSONAL_SPACES)
  async usage(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    const space = await this.personalSpaceService.getInfo(user, workspace.id);
    if (!space) return null;
    return this.quota.getUsage(space.id, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  @RequireFeature(Feature.PERSONAL_SPACES)
  async info(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.personalSpaceService.getInfo(user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @RequireFeature(Feature.PERSONAL_SPACES)
  async create(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    return this.personalSpaceService.create(user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('quota/list')
  @RequireFeature(Feature.PERSONAL_SPACES)
  async quotaList(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    assertCanManageWorkspace(this.workspaceAbility, user, workspace);
    return this.quota.listAll(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('quota/set')
  @RequireFeature(Feature.PERSONAL_SPACES)
  async quotaSet(
    @Body() dto: SetQuotaDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    assertCanManageWorkspace(this.workspaceAbility, user, workspace);
    const n = dto.limit ? bytes(dto.limit) : null;
    if (dto.limit && (n === null || !(n > 0))) {
      throw new BadRequestException('Invalid limit, e.g. "500mb"');
    }
    await this.quota.setLimit(workspace.id, dto.userId ?? null, n);
  }

  @HttpCode(HttpStatus.OK)
  @Post('quota/revoke')
  @RequireFeature(Feature.PERSONAL_SPACES)
  async revoke(
    @Body() dto: UserIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    assertCanManageWorkspace(this.workspaceAbility, user, workspace);
    await this.personalSpaceService.revoke(dto.userId, workspace.id);
  }
}
