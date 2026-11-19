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
import { User } from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { SpaceAccessRequestService } from './space-access-request.service';
import {
  ApproveRequestDto,
  CreateRequestDto,
  InfoDto,
  RejectRequestDto,
  RequestIdDto,
} from './dto/space-access-request.dto';

@UseGuards(JwtAuthGuard)
@Controller('space-access-requests')
export class SpaceAccessRequestController {
  constructor(private readonly service: SpaceAccessRequestService) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@Body() dto: InfoDto, @AuthUser() user: User) {
    return this.service.info(dto.spaceSlug, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  create(@Body() dto: CreateRequestDto, @AuthUser() user: User) {
    return this.service.create(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('cancel')
  cancel(@Body() dto: RequestIdDto, @AuthUser() user: User) {
    return this.service.cancel(dto.id, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('approve')
  approve(@Body() dto: ApproveRequestDto, @AuthUser() user: User) {
    return this.service.approve(dto.id, dto.role, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('reject')
  reject(@Body() dto: RejectRequestDto, @AuthUser() user: User) {
    return this.service.reject(dto.id, dto.reason, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('list')
  list(@Body() pagination: PaginationOptions, @AuthUser() user: User) {
    return this.service.list(user, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('count')
  async count(@AuthUser() user: User) {
    return { count: await this.service.count(user) };
  }
}
