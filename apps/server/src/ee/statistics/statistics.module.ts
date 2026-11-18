import { Module } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';
import { StatisticsQueries } from './statistics.queries';
import { CaslModule } from '../../core/casl/casl.module';

@Module({
  imports: [CaslModule],
  providers: [StatisticsService, StatisticsQueries],
  controllers: [StatisticsController],
})
export class StatisticsModule {}
