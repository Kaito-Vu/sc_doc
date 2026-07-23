import { Module } from '@nestjs/common';
import { SsoService } from './sso.service';
import { SsoController } from './sso.controller';
import { AuthProviderRepo } from './auth-provider.repo';
import { AuthAccountRepo } from './auth-account.repo';

@Module({
  providers: [SsoService, AuthProviderRepo, AuthAccountRepo],
  controllers: [SsoController],
  exports: [SsoService, AuthProviderRepo, AuthAccountRepo],
})
export class SsoModule {}
