import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  BadRequestException,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthWorkspace } from '../../../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { Workspace } from '@docmost/db/types/entity.types';
import { MinioSettingsService } from '../services/minio-settings.service';
import { MinioMigrationService } from '../services/minio-migration.service';
import {
  UpdateMinioSettingsDto,
  TestMinioConnectionDto,
  GetMinioConfigDto,
  TestConnectionResponseDto,
  StartMigrationDto,
  MigrationStatusDto,
} from '../dto';

@Controller('api/v1/workspace/integrations/minio')
@UseGuards(JwtAuthGuard)
export class MinioSettingsController {
  private readonly logger = new Logger(MinioSettingsController.name);

  constructor(
    private readonly minioSettingsService: MinioSettingsService,
    private readonly minioMigrationService: MinioMigrationService,
  ) {}

  @Get('config')
  async getConfig(
    @AuthWorkspace() workspace: Workspace,
  ): Promise<GetMinioConfigDto | { isConfigured: false }> {
    const settings = await this.minioSettingsService.getSettings(workspace.id);

    if (!settings?.isConfigured) {
      return { isConfigured: false };
    }

    return {
      workspaceId: workspace.id,
      minioEndpoint: settings.minioEndpoint,
      minioAccessKey: settings.minioAccessKey,
      minioUseSsl: settings.minioUseSsl,
      isConfigured: settings.isConfigured,
      isEnabled: settings.isEnabled,
      healthStatus: settings.healthStatus,
    };
  }

  @Post('config')
  @HttpCode(HttpStatus.OK)
  async saveConfig(
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: UpdateMinioSettingsDto,
  ) {
    try {
      const settings = await this.minioSettingsService.updateSettings(
        workspace.id,
        dto.minioEndpoint,
        dto.minioAccessKey,
        dto.minioSecretKey,
        dto.minioUseSsl || false,
        dto.gcSoftDeleteGraceDays || 30,
        dto.gcVersionRetentionDays || 90,
      );

      return {
        success: true,
        message: 'MinIO configuration saved successfully',
        data: {
          minioBucketName: settings.minioBucketName,
          isConfigured: settings.isConfigured,
          healthStatus: settings.healthStatus,
        },
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  @Post('test-connection')
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @AuthWorkspace() workspace: Workspace,
    @Body() _dto: TestMinioConnectionDto,
  ): Promise<TestConnectionResponseDto> {
    try {
      const health = await this.minioSettingsService.checkHealth(workspace.id);

      if (health.status === 'healthy') {
        return {
          success: true,
          message: 'Connection successful',
        };
      }

      return {
        success: false,
        message: health.message || 'Connection failed',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  @Get('migration-status')
  async getMigrationStatus(
    @AuthWorkspace() workspace: Workspace,
  ): Promise<MigrationStatusDto> {
    return this.minioMigrationService.getMigrationStatus(workspace.id);
  }

  @Post('start-migration')
  @HttpCode(HttpStatus.OK)
  async startMigration(
    @AuthWorkspace() workspace: Workspace,
    @Body() dto: StartMigrationDto,
  ) {
    try {
      const result = await this.minioMigrationService.startMigration(
        workspace.id,
        dto.newEndpoint,
        dto.useSSL || false,
        dto.accessKey,
        dto.secretKey,
      );

      return {
        success: true,
        message: 'Migration started',
        jobId: result.jobId,
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  @Post('cancel-migration')
  @HttpCode(HttpStatus.OK)
  async cancelMigration(
    @AuthWorkspace() workspace: Workspace,
  ) {
    try {
      await this.minioMigrationService.cancelMigration(workspace.id);

      return {
        success: true,
        message: 'Migration cancelled',
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }

  @Post('rollback')
  @HttpCode(HttpStatus.OK)
  async rollback(
    @AuthWorkspace() workspace: Workspace,
  ) {
    try {
      await this.minioMigrationService.rollback(workspace.id);

      return {
        success: true,
        message: 'Rolled back to previous host',
      };
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : String(error));
    }
  }
}
