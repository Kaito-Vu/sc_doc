import { Inject, Injectable } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { UserMfaRepo } from '../repos/user-mfa.repo';
import { TokenService } from '../../../core/auth/services/token.service';
import { SessionService } from '../../../core/session/session.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { User, Workspace } from '@docmost/db/types/entity.types';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import { LoginContext } from '../types/login-context';

export interface MfaGateResult {
  requiresMfa: boolean;
  authToken?: string;
}

@Injectable()
export class MfaGateService {
  constructor(
    private readonly userMfaRepo: UserMfaRepo,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async checkAndChallenge(
    user: User,
    workspace: Workspace,
    res: FastifyReply,
    loginContext: LoginContext,
  ): Promise<MfaGateResult> {
    const mfa = await this.userMfaRepo.findByUserId(user.id);
    const userHasMfa = mfa?.isEnabled === true;
    const isMfaEnforced = workspace.enforceMfa === true;

    if (userHasMfa || isMfaEnforced) {
      const mfaToken = await this.tokenService.generateMfaToken(
        user,
        workspace.id,
        loginContext,
      );
      res.setCookie('mfaToken', mfaToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: new Date(Date.now() + 5 * 60 * 1000),
        secure: this.environmentService.isHttps(),
      });
      return { requiresMfa: true };
    }

    this.auditService.setActorId(user.id);
    this.auditService.setActorType('user');
    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: {
        method: loginContext.method,
        providerId: loginContext.providerId,
        providerName: loginContext.providerName,
      },
    });

    const authToken = await this.sessionService.createSessionAndToken(user);
    return { requiresMfa: false, authToken };
  }
}
