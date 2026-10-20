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
import { DocMetadataService } from './doc-metadata.service';
import {
  DocMetadataHealthDto,
  DocMetadataPageDto,
  ListDocMetadataDto,
  UpdateDocMetadataDto,
} from './dto/doc-metadata.dto';

@UseGuards(JwtAuthGuard)
@Controller('ee/docs/metadata')
export class DocMetadataController {
  constructor(private readonly service: DocMetadataService) {}

  @Post('info')
  @HttpCode(HttpStatus.OK)
  info(
    @Body() dto: DocMetadataPageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.getInfo(dto.pageId, user, workspace);
  }

  @Post('update')
  @HttpCode(HttpStatus.OK)
  update(
    @Body() dto: UpdateDocMetadataDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.update(dto, user, workspace);
  }

  @Post('list')
  @HttpCode(HttpStatus.OK)
  list(
    @Body() dto: ListDocMetadataDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.list(dto, user, workspace);
  }

  @Post('health')
  @HttpCode(HttpStatus.OK)
  health(
    @Body() dto: DocMetadataHealthDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.service.health(dto, user, workspace);
  }
}
