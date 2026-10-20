import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { User } from '@docmost/db/types/entity.types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREF_GROUPS,
  NotificationChannel,
  isGroupChannelEnabled,
} from '../../core/notification/notification-preferences';
import { UpdateNotificationPreferenceDto } from './notification-preferences.dto';

type Prefs = Record<string, Record<NotificationChannel, boolean>>;

@UseGuards(JwtAuthGuard)
@Controller('notification-preferences')
export class NotificationPreferencesController {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async info(@AuthUser() user: User): Promise<{ groups: Prefs }> {
    return { groups: await this.load(user.id) };
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() dto: UpdateNotificationPreferenceDto,
    @AuthUser() user: User,
  ): Promise<{ groups: Prefs }> {
    const groups = await this.load(user.id);
    groups[dto.group][dto.channel] = dto.enabled;

    // The legacy single switch would still veto page-update recipients in core;
    // per-channel prefs supersede it, so reset it.
    const legacyReset = Object.fromEntries(
      Object.keys(NOTIFICATION_PREF_GROUPS).map((g) => [g, true]),
    );

    await this.db
      .updateTable('users')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
          || jsonb_build_object(
            'notificationPrefs', ${JSON.stringify(groups)}::jsonb,
            'notifications', COALESCE(settings->'notifications', '{}'::jsonb)
              || ${JSON.stringify(legacyReset)}::jsonb)`,
        updatedAt: new Date(),
      })
      .where('id', '=', user.id)
      .execute();

    return { groups };
  }

  private async load(userId: string): Promise<Prefs> {
    const row = await this.db
      .selectFrom('users')
      .select('settings')
      .where('id', '=', userId)
      .executeTakeFirst();

    const groups: Prefs = {};
    for (const group of Object.keys(NOTIFICATION_PREF_GROUPS)) {
      groups[group] = Object.fromEntries(
        NOTIFICATION_CHANNELS.map((c) => [
          c,
          isGroupChannelEnabled(row?.settings, group, c),
        ]),
      ) as Record<NotificationChannel, boolean>;
    }
    return groups;
  }
}
