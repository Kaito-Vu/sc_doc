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
import { MailSettingsService } from './mail-settings.service';
import {
  TestMailSettingsDto,
  UpdateMailSettingsDto,
} from './dto/update-mail-settings.dto';

@UseGuards(JwtAuthGuard)
@Controller('mail-settings')
export class MailSettingsController {
  constructor(
    private readonly service: MailSettingsService,
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
    @Body() dto: UpdateMailSettingsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    assertCanManageWorkspace(this.workspaceAbility, user, workspace);
    return this.service.update(workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reset')
  reset(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    assertCanManageWorkspace(this.workspaceAbility, user, workspace);
    return this.service.remove(workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('test')
  async test(
    @Body() dto: TestMailSettingsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    assertCanManageWorkspace(this.workspaceAbility, user, workspace);
    await this.service.sendTest(workspace, dto.to);
  }
}
