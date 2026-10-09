import { Module } from '@nestjs/common';
import { PersonalSpaceService } from './personal-space.service';
import { PersonalSpaceController } from './personal-space.controller';
import { SpaceModule } from '../../core/space/space.module';
import { SsoModule } from '../sso/sso.module';

@Module({
  imports: [SpaceModule, SsoModule],
  providers: [PersonalSpaceService],
  controllers: [PersonalSpaceController],
})
export class PersonalSpaceModule {}
