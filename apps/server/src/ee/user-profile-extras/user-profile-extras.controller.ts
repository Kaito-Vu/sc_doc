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
import { ApiKeyScope } from '../../common/decorators/api-key-scope.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { UserIdDto } from '../../core/user/dto/user-id.dto';
import { UserProfileExtrasService } from './user-profile-extras.service';
import { UserHandleDto } from './user-handle.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UserProfileExtrasController {
  constructor(
    private readonly extrasService: UserProfileExtrasService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  private viewerOf(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Member)) {
      throw new ForbiddenException();
    }

    return {
      userId: user.id,
      workspaceId: workspace.id,
      canManageMembers: ability.can(
        WorkspaceCaslAction.Manage,
        WorkspaceCaslSubject.Member,
      ),
    };
  }

  @ApiKeyScope('read')
  @HttpCode(HttpStatus.OK)
  @Post('profile-extras')
  async getProfileExtras(
    @Body() dto: UserIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.extrasService.getExtras(
      dto.userId,
      this.viewerOf(user, workspace),
    );
  }

  @ApiKeyScope('read')
  @HttpCode(HttpStatus.OK)
  @Post('resolve-handle')
  async resolveHandle(
    @Body() dto: UserHandleDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.extrasService.resolveHandle(
      dto.handle,
      this.viewerOf(user, workspace),
    );
  }
}
