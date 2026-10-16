import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { ClientLogDto } from './dto/client-log.dto';

// Receives warnings/errors from the browser so they land in the server logs
// (stdout + rotating files) instead of only in the user's DevTools console.
@UseGuards(JwtAuthGuard)
@Controller('client-logs')
export class ClientLogController {
  private readonly logger = new Logger('ClientLog');

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post()
  report(@Body() dto: ClientLogDto, @AuthUser() user: User) {
    const line = `[${dto.context}] ${dto.message} (user=${user.id}, url=${dto.url ?? '-'})`;
    if (dto.level === 'error') this.logger.error(line, dto.stack);
    else this.logger.warn(line);
  }
}
