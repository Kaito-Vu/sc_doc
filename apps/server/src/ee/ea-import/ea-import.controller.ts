import {
  BadRequestException,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Logger,
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
import * as bytes from 'bytes';
import * as path from 'path';
import { EaImportService } from './ea-import.service';
import { EA_IMPORT_MAX_FILE_SIZE } from './ea-import.constants';

const VALID_FILE_EXTENSIONS = ['.xml', '.xmi', '.zip'];

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class EaImportController {
  private readonly logger = new Logger(EaImportController.name);

  constructor(
    private readonly eaImportService: EaImportService,
    private readonly spaceAbility: SpaceAbilityFactory,
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
    const maxSize = Math.min(
      bytes(this.environmentService.getFileImportSizeLimit()),
      bytes(EA_IMPORT_MAX_FILE_SIZE),
    );

    let file = null;
    try {
      file = await req.file({
        limits: { fileSize: maxSize, fields: 1, files: 1 },
      });
    } catch (err: any) {
      this.logger.error(err.message);
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          `File too large. Exceeds the ${EA_IMPORT_MAX_FILE_SIZE} import limit`,
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

    if (!spaceId) {
      throw new BadRequestException('spaceId is required');
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.eaImportService.enqueueEaImport(
      file,
      user.id,
      spaceId,
      workspace.id,
    );
  }
}
