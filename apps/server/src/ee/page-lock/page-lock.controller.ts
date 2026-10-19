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
import { PageLockService } from './page-lock.service';
import { PageIdDto } from '../../core/page/dto/page.dto';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PageLockController {
  constructor(private readonly pageLockService: PageLockService) {}

  @HttpCode(HttpStatus.OK)
  @Post('lock-info')
  info(@Body() body: PageIdDto, @AuthUser() user: User) {
    return this.pageLockService.info(body.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('lock')
  lock(@Body() body: PageIdDto, @AuthUser() user: User) {
    return this.pageLockService.lock(body.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('unlock')
  unlock(@Body() body: PageIdDto, @AuthUser() user: User) {
    return this.pageLockService.unlock(body.pageId, user);
  }
}
