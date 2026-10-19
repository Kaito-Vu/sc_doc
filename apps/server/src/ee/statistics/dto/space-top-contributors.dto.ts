import { IsIn, IsUUID } from 'class-validator';

export class SpaceTopContributorsDto {
  @IsUUID()
  spaceId: string;

  @IsIn(['week', 'month', 'year'])
  period: 'week' | 'month' | 'year';
}
