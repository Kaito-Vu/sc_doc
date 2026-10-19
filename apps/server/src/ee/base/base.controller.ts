import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { BaseService } from './base.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import { FastifyReply } from 'fastify';
import { PageIdDto } from '../../core/page/dto/page.dto';
import {
  ConvertBaseDto,
  CreateBaseDto,
  CreatePropertyDto,
  CreateRowDto,
  CreateViewDto,
  DeleteRowsDto,
  ExpandPagesDto,
  ListBasesDto,
  ListRowsDto,
  PropertyIdDto,
  ReorderPropertyDto,
  ReorderRowDto,
  RowIdDto,
  UpdateBaseDto,
  UpdatePropertyDto,
  UpdateRowDto,
  UpdateViewDto,
  ViewIdDto,
} from './dto/base.dto';

@UseGuards(JwtAuthGuard)
@Controller('bases')
export class BaseController {
  constructor(private readonly baseService: BaseService) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @RequireFeature(Feature.BASES)
  async create(
    @Body() body: CreateBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.create(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  @RequireFeature(Feature.BASES)
  async info(
    @Body() body: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.getInfo(body.pageId, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  @RequireFeature(Feature.BASES)
  async update(
    @Body() body: UpdateBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.update(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  @RequireFeature(Feature.BASES)
  async delete(
    @Body() body: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.baseService.delete(body.pageId, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('convert')
  @RequireFeature(Feature.BASES)
  async convert(
    @Body() body: ConvertBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.convert(
      body.pageId,
      user,
      workspace.id,
      body.template,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('revert')
  @RequireFeature(Feature.BASES)
  async revert(
    @Body() body: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.baseService.revert(body.pageId, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  @RequireFeature(Feature.BASES)
  async list(
    @Body() body: ListBasesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const { spaceId, ...pagination } = body;
    return this.baseService.list(spaceId, user, workspace.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('pages/expand')
  @RequireFeature(Feature.BASES)
  async expandPages(
    @Body() body: ExpandPagesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.expandPages(body.pageIds, user, workspace.id);
  }

  @Post('export-csv')
  @RequireFeature(Feature.BASES)
  async exportCsv(
    @Body() body: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const { csv, fileName } = await this.baseService.exportCsv(
      body.pageId,
      user,
      workspace.id,
    );
    res.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/create')
  @RequireFeature(Feature.BASES)
  async createProperty(
    @Body() body: CreatePropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.createProperty(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/update')
  @RequireFeature(Feature.BASES)
  async updateProperty(
    @Body() body: UpdatePropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.updateProperty(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/delete')
  @RequireFeature(Feature.BASES)
  async deleteProperty(
    @Body() body: PropertyIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.baseService.deleteProperty(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/reorder')
  @RequireFeature(Feature.BASES)
  async reorderProperty(
    @Body() body: ReorderPropertyDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.baseService.reorderProperty(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/create')
  @RequireFeature(Feature.BASES)
  async createRow(
    @Body() body: CreateRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.createRow(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/info')
  @RequireFeature(Feature.BASES)
  async rowInfo(
    @Body() body: RowIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.getRow(body.rowId, body.pageId, user, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/update')
  @RequireFeature(Feature.BASES)
  async updateRow(
    @Body() body: UpdateRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.updateRow(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/delete')
  @RequireFeature(Feature.BASES)
  async deleteRow(
    @Body() body: RowIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.baseService.deleteRow(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/delete-many')
  @RequireFeature(Feature.BASES)
  async deleteRows(
    @Body() body: DeleteRowsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.baseService.deleteRows(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows')
  @RequireFeature(Feature.BASES)
  async listRows(
    @Body() body: ListRowsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const { pageId, ...pagination } = body;
    return this.baseService.listRows(pageId, user, workspace.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/reorder')
  @RequireFeature(Feature.BASES)
  async reorderRow(
    @Body() body: ReorderRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.baseService.reorderRow(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/create')
  @RequireFeature(Feature.BASES)
  async createView(
    @Body() body: CreateViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.createView(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/update')
  @RequireFeature(Feature.BASES)
  async updateView(
    @Body() body: UpdateViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.updateView(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/delete')
  @RequireFeature(Feature.BASES)
  async deleteView(
    @Body() body: ViewIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.baseService.deleteView(user, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views')
  @RequireFeature(Feature.BASES)
  async listViews(
    @Body() body: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.listViews(body.pageId, user, workspace.id);
  }
}
