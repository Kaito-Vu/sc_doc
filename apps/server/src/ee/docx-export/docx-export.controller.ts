import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import { FastifyReply } from 'fastify';
import { DocxExportJobService } from './docx-export-job.service';
import { DocxExportService } from './docx-export.service';
import { DocxExportDto } from './docx-export.dto';
import { PageIdDto } from '../../core/page/dto/page.dto';

@UseGuards(JwtAuthGuard)
@Controller('docx-export')
export class DocxExportController {
  constructor(
    private readonly jobs: DocxExportJobService,
    private readonly exporter: DocxExportService,
  ) {}

  /** Queues the export; the client polls `status/:jobId` and then follows the download link. */
  @HttpCode(HttpStatus.ACCEPTED)
  @Post()
  @RequireFeature(Feature.DOCX_EXPORT)
  start(
    @Body() body: DocxExportDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.jobs.enqueue(user, workspace.id, body);
  }

  /** Subpages in default order, for the dialog's reorder list. */
  @HttpCode(HttpStatus.OK)
  @Post('tree')
  @RequireFeature(Feature.DOCX_EXPORT)
  tree(@Body() body: PageIdDto, @AuthUser() user: User) {
    return this.exporter.listTree(body.pageId, user);
  }

  @Get('status/:jobId')
  @RequireFeature(Feature.DOCX_EXPORT)
  status(@Param('jobId') jobId: string, @AuthUser() user: User) {
    return this.jobs.status(user, jobId);
  }

  @Get('download/:token')
  @RequireFeature(Feature.DOCX_EXPORT)
  async download(
    @Param('token') token: string,
    @AuthUser() user: User,
    @Res() res: FastifyReply,
  ) {
    const { stream, fileName, contentType } = await this.jobs.resolveDownload(
      user,
      token,
    );
    res.header(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.header('Content-Type', contentType);
    res.send(stream);
  }
}
