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
import { CommentResolveService } from './comment-resolve.service';
import { ResolveCommentDto } from './dto/resolve-comment.dto';

@UseGuards(JwtAuthGuard)
@Controller('comments')
export class CommentResolveController {
  constructor(private readonly commentResolveService: CommentResolveService) {}

  @HttpCode(HttpStatus.OK)
  @Post('resolve')
  async resolve(
    @Body() body: ResolveCommentDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.commentResolveService.resolve(body, user, workspace.id);
  }
}
