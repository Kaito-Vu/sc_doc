import { Module } from '@nestjs/common';
import { MfaService } from './services/mfa.service';
import { MfaGateService } from './services/mfa-gate.service';
import { MfaController } from './mfa.controller';
import { UserMfaRepo } from './repos/user-mfa.repo';
import { TokenModule } from '../../core/auth/token.module';
import { SessionModule } from '../../core/session/session.module';

@Module({
  imports: [TokenModule, SessionModule],
  providers: [MfaService, MfaGateService, UserMfaRepo],
  controllers: [MfaController],
  exports: [MfaService, MfaGateService],
})
export class MfaModule {}
