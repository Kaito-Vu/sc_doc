import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { StatisticsService } from './statistics.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { SpaceIdDto } from '../../core/space/dto/space-id.dto';
import { WorkspaceTopContributorsDto } from './dto/workspace-top-contributors.dto';
import { SpaceTopContributorsDto } from './dto/space-top-contributors.dto';

@UseGuards(JwtAuthGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  private assertWorkspaceAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }

  private async assertSpaceAdmin(user: User, spaceId: string) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('workspace')
  @RequireFeature(Feature.STATISTICS)
  async getWorkspaceStats(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertWorkspaceAdmin(user, workspace);
    return this.statisticsService.getWorkspaceStats(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('workspace/top-contributors')
  @RequireFeature(Feature.STATISTICS)
  async getWorkspaceTopContributors(
    @Body() dto: WorkspaceTopContributorsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.assertWorkspaceAdmin(user, workspace);
    return this.statisticsService.getTopContributors(
      { workspaceId: workspace.id },
      dto.period,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('space')
  @RequireFeature(Feature.STATISTICS)
  async getSpaceStats(
    @Body() dto: SpaceIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpaceAdmin(user, dto.spaceId);
    return this.statisticsService.getSpaceStats(dto.spaceId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('space/top-contributors')
  @RequireFeature(Feature.STATISTICS)
  async getSpaceTopContributors(
    @Body() dto: SpaceTopContributorsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSpaceAdmin(user, dto.spaceId);
    return this.statisticsService.getTopContributors(
      { workspaceId: workspace.id, spaceId: dto.spaceId },
      dto.period,
    );
  }
}
