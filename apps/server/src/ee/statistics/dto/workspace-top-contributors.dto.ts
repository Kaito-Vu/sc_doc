import { IsIn } from 'class-validator';

export class WorkspaceTopContributorsDto {
  @IsIn(['week', 'month', 'year'])
  period: 'week' | 'month' | 'year';
}
