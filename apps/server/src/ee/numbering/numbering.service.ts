import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { User } from '@docmost/db/types/entity.types';
import { NumberingSettings } from '@docmost/editor-ext';

@Injectable()
export class NumberingService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
  ) {}

  private assertValid(settings: NumberingSettings): void {
    if (!settings || !Array.isArray(settings.levels) || settings.levels.length !== 10) {
      throw new BadRequestException('numberingSettings.levels must have exactly 10 entries');
    }
    for (const level of settings.levels) {
      if (!level || typeof level.format !== 'string' || typeof level.text !== 'string') {
        throw new BadRequestException('Each numbering level requires a format and text pattern');
      }
    }
  }

  async updateSettings(
    pageId: string,
    settings: NumberingSettings,
    user: User,
  ): Promise<NumberingSettings> {
    this.assertValid(settings);

    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);

    await this.pageRepo.updatePage({ numberingSettings: settings as any }, pageId);

    return settings;
  }
}
