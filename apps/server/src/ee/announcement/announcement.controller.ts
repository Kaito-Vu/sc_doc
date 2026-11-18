import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { assertWorkspaceAdmin } from '../common/workspace-admin';
import { Feature } from '../../common/features';
import { AnnouncementService } from './announcement.service';
import {
  AnnouncementIdDto,
  AnnouncementInputDto,
  ListAnnouncementsDto,
  UpdateAnnouncementDto,
} from './dto/announcement.dto';

@UseGuards(JwtAuthGuard)
@Controller('announcements')
export class AnnouncementController {
  constructor(
    private readonly announcementService: AnnouncementService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  private admin(user: User, workspace: Workspace) {
    assertWorkspaceAdmin(this.workspaceAbility, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('visible')
  @RequireFeature(Feature.ANNOUNCEMENTS)
  getVisible(@AuthWorkspace() workspace: Workspace) {
    return this.announcementService.getVisible(workspace.id);
  }

  // No user here, so the feature gate is checked in the service
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('public')
  getPublic(@Req() req: any) {
    return this.announcementService.getPublic(req.raw?.workspaceId);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  @RequireFeature(Feature.ANNOUNCEMENTS)
  list(
    @Body() dto: ListAnnouncementsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.admin(user, workspace);
    return this.announcementService.list(workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @RequireFeature(Feature.ANNOUNCEMENTS)
  create(
    @Body() dto: AnnouncementInputDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.admin(user, workspace);
    return this.announcementService.create(workspace.id, user.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  @RequireFeature(Feature.ANNOUNCEMENTS)
  update(
    @Body() dto: UpdateAnnouncementDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.admin(user, workspace);
    return this.announcementService.update(
      workspace.id,
      user.id,
      dto.announcementId,
      dto,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('archive')
  @RequireFeature(Feature.ANNOUNCEMENTS)
  archive(
    @Body() dto: AnnouncementIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.admin(user, workspace);
    return this.announcementService.archive(
      workspace.id,
      user.id,
      dto.announcementId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('unarchive')
  @RequireFeature(Feature.ANNOUNCEMENTS)
  unarchive(
    @Body() dto: AnnouncementIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.admin(user, workspace);
    return this.announcementService.unarchive(
      workspace.id,
      user.id,
      dto.announcementId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  @RequireFeature(Feature.ANNOUNCEMENTS)
  async delete(
    @Body() dto: AnnouncementIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.admin(user, workspace);
    await this.announcementService.delete(workspace.id, dto.announcementId);
  }
}
