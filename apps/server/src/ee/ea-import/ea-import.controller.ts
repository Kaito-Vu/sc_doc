import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { FileInterceptor } from '../../common/interceptors/file.interceptor';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { Feature } from '../../common/features';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { IsUUID, isUUID } from 'class-validator';
import * as bytes from 'bytes';
import * as path from 'path';
import { EaImportMode, EaImportService } from './ea-import.service';

class EaCancelDto {
  @IsUUID()
  fileTaskId: string;
}

const VALID_FILE_EXTENSIONS = ['.xml', '.xmi', '.zip'];
const VALID_MODES: readonly EaImportMode[] = ['replace', 'keep', 'merge'];

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class EaImportController {
  private readonly logger = new Logger(EaImportController.name);

  constructor(
    private readonly eaImportService: EaImportService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @UseInterceptors(FileInterceptor)
  @HttpCode(HttpStatus.OK)
  @Post('import-ea')
  @RequireFeature(Feature.EA_IMPORT)
  async importEa(
    @Req() req: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const sizeLimit = this.environmentService.getFileImportSizeLimit();
    const maxSize = bytes(sizeLimit);

    let file = null;
    try {
      file = await req.file({
        limits: { fileSize: maxSize, fields: 3, files: 1 },
      });
    } catch (err: any) {
      this.logger.error(err.message);
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          `File too large. Exceeds the ${sizeLimit} import limit`,
        );
      }
      throw new BadRequestException('Failed to upload file');
    }

    if (!file) {
      throw new BadRequestException('Failed to upload file');
    }

    if (
      !VALID_FILE_EXTENSIONS.includes(path.extname(file.filename).toLowerCase())
    ) {
      throw new BadRequestException(
        'Invalid import file type. Accepted file types: .xml, .xmi, .zip',
      );
    }

    const spaceId = file.fields?.spaceId?.value;
    const rawMode = file.fields?.mode?.value;
    const mode = VALID_MODES.find((m) => m === rawMode);
    const parentPageId = file.fields?.parentPageId?.value || undefined;

    if (!spaceId || !isUUID(spaceId)) {
      throw new BadRequestException('spaceId is required');
    }
    if (parentPageId !== undefined && !isUUID(parentPageId)) {
      throw new BadRequestException('Invalid parent page');
    }

    // Space editors only: replace/merge rewrite earlier imports in the space.
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    if (parentPageId) {
      // Same rule as creating a sub-page: page-level permissions apply.
      const parent = await this.pageRepo.findById(parentPageId);
      if (!parent || parent.deletedAt || parent.spaceId !== spaceId) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccessService.validateCanEdit(parent, user);
    }

    return this.eaImportService.enqueueEaImport(
      file,
      user.id,
      spaceId,
      workspace.id,
      mode,
      parentPageId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('import-ea/active')
  @RequireFeature(Feature.EA_IMPORT)
  async activeImports(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.eaImportService.listActive(user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('import-ea/cancel')
  @RequireFeature(Feature.EA_IMPORT)
  async cancelImport(
    @Body() dto: EaCancelDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.eaImportService.cancelEaImport(
      dto.fileTaskId,
      user.id,
      workspace.id,
    );
  }
}
