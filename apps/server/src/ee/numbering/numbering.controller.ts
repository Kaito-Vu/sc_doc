import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@docmost/db/types/entity.types';
import { NumberingService } from './numbering.service';
import { RequireFeature } from '../common/decorators/require-feature.decorator';
import { Feature } from '../../common/features';
import { NumberingSettings } from '@docmost/editor-ext';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class NumberingController {
  constructor(private readonly numberingService: NumberingService) {}

  @HttpCode(HttpStatus.OK)
  @Post('numbering-settings')
  @RequireFeature(Feature.NUMBERING)
  async updateNumberingSettings(
    @Body() body: { pageId: string; numberingSettings: NumberingSettings },
    @AuthUser() user: User,
  ) {
    const numberingSettings = await this.numberingService.updateSettings(
      body.pageId,
      body.numberingSettings,
      user,
    );
    return { numberingSettings };
  }
}
