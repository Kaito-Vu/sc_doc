import { Module } from '@nestjs/common';
import { NumberingService } from './numbering.service';
import { NumberingController } from './numbering.controller';
import { PageAccessModule } from '../../core/page/page-access/page-access.module';

@Module({
  imports: [PageAccessModule],
  providers: [NumberingService],
  controllers: [NumberingController],
})
export class NumberingModule {}
