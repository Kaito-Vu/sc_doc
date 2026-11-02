import { Global, Module } from '@nestjs/common';
import { PersonalSpaceService } from './personal-space.service';
import { PersonalSpaceController } from './personal-space.controller';
import { SpaceModule } from '../../core/space/space.module';
import {
  PERSONAL_SPACE_QUOTA,
  PersonalSpaceQuotaService,
} from './personal-space-quota.service';
import { SsoModule } from '../sso/sso.module';

@Global()
@Module({
  imports: [SpaceModule, SsoModule],
  providers: [
    PersonalSpaceService,
    PersonalSpaceQuotaService,
    { provide: PERSONAL_SPACE_QUOTA, useExisting: PersonalSpaceQuotaService },
  ],
  exports: [PERSONAL_SPACE_QUOTA],
  controllers: [PersonalSpaceController],
})
export class PersonalSpaceModule {}
