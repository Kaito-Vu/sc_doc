import { Controller, Get, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { WorkspaceFaviconRepository } from '../repositories/workspace-favicon.repo';

@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class WorkspaceFaviconController {
  constructor(
    private readonly workspaceFaviconRepo: WorkspaceFaviconRepository,
  ) {}

  @Get('workspaces/favicon')
  @HttpCode(HttpStatus.OK)
  async getFavicon(
    @AuthWorkspace() workspace: Workspace,
  ): Promise<{ favicon: string | null }> {
    const favicon = await this.workspaceFaviconRepo.getFavicon(workspace.id);
    return { favicon };
  }
}
