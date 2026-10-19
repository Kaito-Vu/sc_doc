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
import { PagePermissionService } from './page-permission.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import { PageIdDto } from '../../core/page/dto/page.dto';
import {
  AddPagePermissionDto,
  PagePermissionsDto,
  RemovePagePermissionDto,
  UpdatePagePermissionDto,
} from './dto/page-permission.dto';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PagePermissionController {
  constructor(private readonly pagePermissionService: PagePermissionService) {}

  @HttpCode(HttpStatus.OK)
  @Post('restrict')
  @RequireFeature(Feature.PAGE_PERMISSIONS)
  async restrict(
    @Body() body: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.pagePermissionService.restrictPage(
      body.pageId,
      user,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-restriction')
  @RequireFeature(Feature.PAGE_PERMISSIONS)
  async unrestrict(@Body() body: PageIdDto, @AuthUser() user: User) {
    await this.pagePermissionService.unrestrictPage(body.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('add-permission')
  @RequireFeature(Feature.PAGE_PERMISSIONS)
  async addPermission(
    @Body() body: AddPagePermissionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.pagePermissionService.addPermission(body, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-permission')
  @RequireFeature(Feature.PAGE_PERMISSIONS)
  async removePermission(
    @Body() body: RemovePagePermissionDto,
    @AuthUser() user: User,
  ) {
    await this.pagePermissionService.removePermission(body, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-permission')
  @RequireFeature(Feature.PAGE_PERMISSIONS)
  async updatePermission(
    @Body() body: UpdatePagePermissionDto,
    @AuthUser() user: User,
  ) {
    await this.pagePermissionService.updatePermissionRole(body, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('permissions')
  @RequireFeature(Feature.PAGE_PERMISSIONS)
  async permissions(@Body() body: PagePermissionsDto, @AuthUser() user: User) {
    const { pageId, ...pagination } = body;
    return this.pagePermissionService.getPermissions(pageId, user, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('permission-info')
  @RequireFeature(Feature.PAGE_PERMISSIONS)
  async permissionInfo(@Body() body: PageIdDto, @AuthUser() user: User) {
    return this.pagePermissionService.getRestrictionInfo(body.pageId, user);
  }
}
