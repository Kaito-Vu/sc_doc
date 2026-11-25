import {
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
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { assertCanManageWorkspace } from '../common/workspace-admin';
import { AttachmentSettingsService } from './attachment-settings.service';
import { UpdateAttachmentSettingsDto } from './dto/update-attachment-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('attachment-settings')
export class AttachmentSettingsController {
  constructor(
    private readonly service: AttachmentSettingsService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    assertCanManageWorkspace(this.workspaceAbility, user, workspace);
    return this.service.get(workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  update(
    @Body() dto: UpdateAttachmentSettingsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    assertCanManageWorkspace(this.workspaceAbility, user, workspace);
    return this.service.update(workspace, dto);
  }
}
