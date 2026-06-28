import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
  Param,
  Query,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { AuthUser } from '../../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { Workspace, User } from '@docmost/db/types/entity.types';
import { PageRepo } from '../../../../database/repos/page/page.repo';
import { AttachmentService } from '../services/attachment.service';
import { MinioSettingsService } from '../services/minio-settings.service';
import {
  UpdateMinioSettingsDto,
  GetMinioSettingsResponseDto,
  AttachmentResponseDto,
  ListAttachmentsResponseDto,
} from '../dto';

@Controller('api/v1/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentController {
  private logger = new Logger(AttachmentController.name);

  constructor(
    private attachmentService: AttachmentService,
    private minioSettingsService: MinioSettingsService,
    private pageRepo: PageRepo,
  ) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  async upload(
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Body() body: any,
    @Query('pageId') pageId: string,
    @Query('subpageId') subpageId?: string,
  ) {
    if (!pageId) {
      throw new BadRequestException('pageId is required');
    }

    // Get page to extract slug
    const page = await this.pageRepo.findById(pageId);
    if (!page) {
      throw new BadRequestException('Page not found');
    }

    const results = [];

    // In Fastify, file uploads come through body.file
    // For now, we'll document this for the frontend
    // Real file upload handling would be via Fastify multipart plugin

    return {
      success: true,
      data: results,
      message: 'Upload endpoint - implement file upload via Fastify multipart',
    };
  }

  @Get(':id/download')
  async download(
    @Param('id') attachmentId: string,
    @AuthWorkspace() workspace: Workspace,
    @Query('version') versionId: string = '',
    @Res() res: FastifyReply,
  ) {
    try {
      const buffer = await this.attachmentService.downloadAttachment(attachmentId, workspace.id, versionId);

      res.header('Content-Type', 'application/octet-stream');
      res.header('Content-Disposition', `attachment; filename="${attachmentId}"`);
      await res.send(buffer);
    } catch (error) {
      this.logger.error(`Download failed: ${(error as Error).message}`);
      throw error;
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
    @Param('id') attachmentId: string,
  ) {
    await this.attachmentService.deleteAttachment(attachmentId, workspace.id, user.id);

    return {
      success: true,
      message: 'Attachment deleted',
    };
  }

  @Get('page/:pageId')
  async listByPage(
    @AuthWorkspace() workspace: Workspace,
    @Param('pageId') pageId: string,
    @Query('subpageId') subpageId?: string,
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
  ) {
    const { attachments, total } = await this.attachmentService.listByPage(
      pageId,
      workspace.id,
      limit,
      offset,
    );

    const response: ListAttachmentsResponseDto = {
      data: attachments.map(this.mapToResponseDto),
      pagination: {
        total,
        limit,
        offset,
      },
    };

    return response;
  }

  @Get('workspace/:workspaceId/minio-settings')
  async getSettings(
    @AuthWorkspace() workspace: Workspace,
    @Param('workspaceId') workspaceId: string,
  ) {
    if (workspaceId !== workspace.id) {
      throw new BadRequestException('Forbidden');
    }

    const settings = await this.minioSettingsService.getSettings(workspace.id);
    if (!settings) {
      return { isConfigured: false, isEnabled: false };
    }

    const storageUsed = await this.minioSettingsService.getStorageUsage(workspace.id);

    const response: GetMinioSettingsResponseDto = {
      workspaceId: workspace.id,
      minioBucketName: settings.minioBucketName,
      isConfigured: settings.isConfigured,
      isEnabled: settings.isEnabled,
      healthStatus: settings.healthStatus,
      gcSoftDeleteGraceDays: settings.gcSoftDeleteGraceDays,
      gcVersionRetentionDays: settings.gcVersionRetentionDays,
      storageUsed,
      storageLimit: 107374182400, // 100 GB default
      lastSyncAt: settings.gcLastRunAt,
    };

    return response;
  }

  @Put('workspace/:workspaceId/minio-settings')
  async updateSettings(
    @AuthWorkspace() workspace: Workspace,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: UpdateMinioSettingsDto,
  ) {
    if (workspaceId !== workspace.id) {
      throw new BadRequestException('Forbidden');
    }

    const settings = await this.minioSettingsService.updateSettings(
      workspace.id,
      dto.minioEndpoint,
      dto.minioAccessKey,
      dto.minioSecretKey,
      dto.minioUseSsl,
      dto.gcSoftDeleteGraceDays,
      dto.gcVersionRetentionDays,
    );

    return {
      success: true,
      message: 'Settings updated and bucket initialized',
      data: {
        minioBucketName: settings.minioBucketName,
        bucketCreatedAt: settings.bucketCreatedAt,
        healthStatus: settings.healthStatus,
      },
    };
  }

  private mapToResponseDto(attachment: any): AttachmentResponseDto {
    return {
      id: attachment.id,
      filename: attachment.filename,
      fileExtension: attachment.fileExtension,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      createdBy: attachment.createdBy,
      createdAt: attachment.createdAt,
      downloadCount: attachment.downloadCount,
      minioPath: attachment.minioPath,
    };
  }
}
