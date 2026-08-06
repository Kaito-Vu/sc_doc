import { IsIn, IsString } from 'class-validator';

export class SpaceTopContributorsDto {
  @IsString()
  spaceId: string;

  @IsIn(['week', 'month', 'year'])
  period: 'week' | 'month' | 'year';
}
