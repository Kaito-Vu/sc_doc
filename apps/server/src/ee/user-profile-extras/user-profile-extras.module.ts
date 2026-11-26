import { Module } from '@nestjs/common';
import { CaslModule } from '../../core/casl/casl.module';
import { UserProfileExtrasController } from './user-profile-extras.controller';
import { UserProfileExtrasService } from './user-profile-extras.service';

@Module({
  imports: [CaslModule],
  controllers: [UserProfileExtrasController],
  providers: [UserProfileExtrasService],
})
export class UserProfileExtrasModule {}
