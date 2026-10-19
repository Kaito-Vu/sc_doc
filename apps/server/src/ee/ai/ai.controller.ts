import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AiService } from './ai.service';
import { AiGenerateDto } from './ai.dto';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import { FastifyReply } from 'fastify';
import { SearchDTO } from '../../core/search/dto/search.dto';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { streamSse } from './sse.util';

const MAX_ANSWER_SEARCH_LIMIT = 25;

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly spaceAbility: SpaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('generate')
  @RequireFeature(Feature.AI)
  async generate(
    @Body() body: AiGenerateDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiService.generate(body, workspace.id);
  }

  @Post('generate/stream')
  @RequireFeature(Feature.AI)
  async generateStream(
    @Body() body: AiGenerateDto,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    await streamSse(
      res,
      this.aiService.generateStream(body, workspace.id),
      'Generation failed',
    );
  }

  @Post('answers')
  @RequireFeature(Feature.AI)
  async answers(
    @Body() body: SearchDTO,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    // Same scoping as core SearchController.pageSearch: SearchService only
    // filters by membership when no spaceId is given, so an explicit spaceId
    // must be authorized here or any space's pages would leak into answers.
    delete body.shareId;
    if (body.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        body.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }
    body.limit = Math.min(
      Math.max(body.limit || MAX_ANSWER_SEARCH_LIMIT, 1),
      MAX_ANSWER_SEARCH_LIMIT,
    );
    body.offset = Math.max(body.offset || 0, 0);

    await streamSse(
      res,
      this.aiService.answerStream(body, {
        userId: user.id,
        workspaceId: workspace.id,
      }),
      'Search failed',
    );
  }
}
