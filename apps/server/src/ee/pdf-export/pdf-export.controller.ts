import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PdfExportService } from './pdf-export.service';
import { TokenService } from '../../core/auth/services/token.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { PageIdDto } from '../../core/page/dto/page.dto';
import { IsNotEmpty, IsString } from 'class-validator';

class PdfRenderDto extends PageIdDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}

@Controller('pdf-export')
export class PdfExportController {
  constructor(
    private readonly pdfExportService: PdfExportService,
    private readonly tokenService: TokenService,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('render')
  async render(@Body() body: PdfRenderDto) {
    const data = await this.pdfExportService.getRenderPayload(
      body.pageId,
      body.token,
    );
    return { data };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('export')
  @RequireFeature(Feature.PDF_EXPORT)
  async export(
    @Body() body: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(body.pageId);
    // Never queue or mint a render token for a page the caller cannot view.
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(page, user);
    const { fileTaskId } = await this.pdfExportService.queuePageExport(
      page.id,
      user.id,
      workspace.id,
    );
    const downloadToken = await this.tokenService.generatePdfExportDownloadToken(
      fileTaskId,
      workspace.id,
    );
    const renderToken = await this.tokenService.generatePdfRenderToken(
      page.id,
      workspace.id,
    );
    return { fileTaskId, downloadToken, renderToken };
  }
}
