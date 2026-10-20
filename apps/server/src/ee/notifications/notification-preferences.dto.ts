import { IsBoolean, IsIn, IsString } from 'class-validator';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREF_GROUPS,
  NotificationChannel,
} from '../../core/notification/notification-preferences';

export class UpdateNotificationPreferenceDto {
  @IsString()
  @IsIn(Object.keys(NOTIFICATION_PREF_GROUPS))
  group: string;

  @IsIn(NOTIFICATION_CHANNELS)
  channel: NotificationChannel;

  @IsBoolean()
  enabled: boolean;
}
