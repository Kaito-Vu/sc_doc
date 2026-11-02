import { assertWorkspaceAdmin } from '../common/workspace-admin';
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Workspace, User } from '@docmost/db/types/entity.types';
import { LicenseService } from './license.service';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

class ActivateLicenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  licenseKey: string;
}

@UseGuards(JwtAuthGuard)
@Controller('license')
export class LicenseController {
  constructor(
    private readonly licenseService: LicenseService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async getInfo(@AuthWorkspace() workspace: Workspace) {
    return this.licenseService.getLicenseInfo(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('activate')
  async activate(
    @Body() body: ActivateLicenseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    assertWorkspaceAdmin(this.workspaceAbility, user, workspace);
    return this.licenseService.activateLicense(workspace.id, body.licenseKey);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove')
  async remove(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    assertWorkspaceAdmin(this.workspaceAbility, user, workspace);
    await this.licenseService.removeLicense(workspace.id);
    return { success: true };
  }
}
