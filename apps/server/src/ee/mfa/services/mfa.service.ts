import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as OTPAuth from 'otpauth';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UserMfaRepo } from '../repos/user-mfa.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { TokenService } from '../../../core/auth/services/token.service';
import { SessionService } from '../../../core/session/session.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { LoginDto } from '../../../core/auth/dto/login.dto';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { comparePasswordHash, isUserDisabled } from '../../../common/helpers';
import { FastifyReply } from 'fastify';
import { JwtMfaTokenPayload, JwtType } from '../../../core/auth/dto/jwt-payload';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import { throwIfEmailNotVerified } from '../../../core/auth/auth.util';
import { setAuthCookie, setMfaCookie } from '../auth-cookies';
import { resolveMfaState } from './mfa-gate.service';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';

@Injectable()
export class MfaService {
  constructor(
    private readonly userMfaRepo: UserMfaRepo,
    private readonly userRepo: UserRepo,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
    private readonly workspaceRepo: WorkspaceRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async getStatus(userId: string) {
    const mfa = await this.userMfaRepo.findByUserId(userId);
    return {
      isEnabled: mfa?.isEnabled === true,
      method: mfa?.method ?? null,
      backupCodesCount: mfa?.backupCodes?.length ?? 0,
    };
  }

  async setup(user: User, workspace: Workspace) {
    // Re-running setup would overwrite the secret and silently turn MFA off;
    // disabling must go through disable(), which re-checks the password.
    const existing = await this.userMfaRepo.findByUserId(user.id);
    if (existing?.isEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: workspace.name || 'Docmost',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    await this.userMfaRepo.upsert({
      userId: user.id,
      workspaceId: workspace.id,
      method: 'totp',
      secret: secret.base32,
      isEnabled: false,
      backupCodes: null,
    });

    return {
      method: 'totp',
      qrCode: '',
      manualKey: secret.base32,
      otpauthUrl: totp.toString(),
    };
  }

  async enable(userId: string, verificationCode: string) {
    if (typeof verificationCode !== 'string') {
      throw new BadRequestException('Invalid verification code');
    }
    const mfa = await this.userMfaRepo.findByUserId(userId);
    if (!mfa?.secret) {
      throw new BadRequestException('MFA setup required');
    }
    if (mfa.isEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    if (!this.verifyTotp(mfa.secret, verificationCode)) {
      throw new BadRequestException('Invalid verification code');
    }

    const { backupCodes, hashedCodes } = await this.generateBackupCodes();

    await this.userMfaRepo.update(userId, {
      isEnabled: true,
      backupCodes: hashedCodes,
    });

    this.auditService.log({
      event: AuditEvent.USER_MFA_ENABLED,
      resourceType: AuditResource.USER,
      resourceId: userId,
    });

    return { success: true, backupCodes };
  }

  async disable(userId: string, workspaceId: string, password?: string) {
    await this.assertPasswordConfirmed(userId, workspaceId, password);

    await this.userMfaRepo.update(userId, {
      isEnabled: false,
      secret: null,
      backupCodes: null,
    });

    this.auditService.log({
      event: AuditEvent.USER_MFA_DISABLED,
      resourceType: AuditResource.USER,
      resourceId: userId,
    });

    return { success: true };
  }

  async regenerateBackupCodes(
    userId: string,
    workspaceId: string,
    password?: string,
  ) {
    await this.assertPasswordConfirmed(userId, workspaceId, password);

    const mfa = await this.userMfaRepo.findByUserId(userId);
    if (!mfa?.isEnabled) {
      throw new BadRequestException('MFA is not enabled');
    }

    const { backupCodes, hashedCodes } = await this.generateBackupCodes();

    await this.userMfaRepo.update(userId, { backupCodes: hashedCodes });

    this.auditService.log({
      event: AuditEvent.USER_MFA_BACKUP_CODE_GENERATED,
      resourceType: AuditResource.USER,
      resourceId: userId,
    });

    return { backupCodes };
  }

  async checkMfaRequirements(
    loginInput: LoginDto,
    workspace: Workspace,
    res: FastifyReply,
  ) {
    const user = await this.userRepo.findByEmail(loginInput.email, workspace.id, {
      includePassword: true,
    });

    const errorMessage = 'Email or password does not match';
    if (!user || isUserDisabled(user)) {
      this.auditService.log({
        event: AuditEvent.USER_LOGIN_FAILED,
        resourceType: AuditResource.USER,
        metadata: {
          method: 'local',
          failureReason: !user ? 'user_not_found' : 'account_disabled',
          attemptedEmail: loginInput.email,
        },
      });
      throw new UnauthorizedException(errorMessage);
    }

    const isPasswordMatch = await comparePasswordHash(
      loginInput.password,
      user.password,
    );
    if (!isPasswordMatch) {
      this.auditService.log({
        event: AuditEvent.USER_LOGIN_FAILED,
        resourceType: AuditResource.USER,
        metadata: {
          method: 'local',
          failureReason: 'invalid_password',
          attemptedEmail: loginInput.email,
        },
      });
      throw new UnauthorizedException(errorMessage);
    }

    throwIfEmailNotVerified({
      isCloud: this.environmentService.isCloud(),
      emailVerifiedAt: user.emailVerifiedAt,
      email: user.email,
      workspaceId: workspace.id,
      appSecret: this.environmentService.getAppSecret(),
    });

    const mfa = await this.userMfaRepo.findByUserId(user.id);
    const { userHasMfa, isMfaEnforced, requiresMfa } = resolveMfaState(
      mfa,
      workspace,
    );

    if (requiresMfa) {
      const mfaToken = await this.tokenService.generateMfaToken(
        user,
        workspace.id,
        { method: 'local' },
      );
      setMfaCookie(res, this.environmentService, mfaToken);

      return {
        userHasMfa,
        requiresMfaSetup: isMfaEnforced && !userHasMfa,
        isMfaEnforced,
      };
    }

    user.lastLoginAt = new Date();
    await this.userRepo.updateLastLogin(user.id, workspace.id);

    this.auditService.setActorId(user.id);
    this.auditService.setActorType('user');
    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: { method: 'local' },
    });

    const authToken = await this.sessionService.createSessionAndToken(user);
    return { authToken };
  }

  async validateMfaAccess(req: any) {
    const token = req.cookies?.mfaToken;
    if (!token) {
      return { valid: false };
    }

    try {
      const payload = (await this.tokenService.verifyJwt(
        token,
        JwtType.MFA_TOKEN,
      )) as JwtMfaTokenPayload;

      const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
      if (!user || isUserDisabled(user)) {
        return { valid: false };
      }

      const mfa = await this.userMfaRepo.findByUserId(user.id);
      const workspace = await this.workspaceRepo.findById(payload.workspaceId);

      return {
        valid: true,
        isTransferToken: true,
        userHasMfa: mfa?.isEnabled === true,
        requiresMfaSetup:
          !mfa?.isEnabled && workspace?.enforceMfa === true,
        isMfaEnforced: workspace?.enforceMfa === true,
      };
    } catch {
      return { valid: false };
    }
  }

  async verifyAndLogin(code: string, req: any, res: FastifyReply) {
    const token = req.cookies?.mfaToken;
    if (!token) {
      throw new UnauthorizedException('MFA session expired');
    }

    const payload = (await this.tokenService.verifyJwt(
      token,
      JwtType.MFA_TOKEN,
    )) as JwtMfaTokenPayload;

    const user = await this.userRepo.findById(payload.sub, payload.workspaceId);
    if (!user || isUserDisabled(user)) {
      throw new UnauthorizedException();
    }

    const mfa = await this.userMfaRepo.findByUserId(user.id);
    if (!mfa?.isEnabled) {
      throw new BadRequestException('MFA setup required');
    }

    const valid = await this.verifyCode(mfa, code);
    if (!valid) {
      this.auditService.log({
        event: AuditEvent.USER_LOGIN_FAILED,
        resourceType: AuditResource.USER,
        metadata: {
          method: payload.method ?? 'local',
          providerId: payload.providerId,
          providerName: payload.providerName,
          failureReason: 'invalid_mfa_code',
        },
      });
      throw new UnauthorizedException('Invalid verification code');
    }

    user.lastLoginAt = new Date();
    await this.userRepo.updateLastLogin(user.id, payload.workspaceId);

    const authToken = await this.sessionService.createSessionAndToken(user);
    // Must match the path it was set with, or the browser keeps the cookie.
    res.clearCookie('mfaToken', { path: '/' });
    setAuthCookie(res, this.environmentService, authToken);

    this.auditService.setActorId(user.id);
    this.auditService.setActorType('user');
    this.auditService.log({
      event: AuditEvent.USER_LOGIN,
      resourceType: AuditResource.USER,
      resourceId: user.id,
      metadata: {
        method: payload.method ?? 'local',
        providerId: payload.providerId,
        providerName: payload.providerName,
        mfaUsed: true,
      },
    });

    return { success: true };
  }

  /**
   * Requires the current password before weakening MFA, so a hijacked
   * session alone cannot turn it off. Skipped only for SSO/SCIM-provisioned
   * users whose password was generated and never shown to them.
   */
  private async assertPasswordConfirmed(
    userId: string,
    workspaceId: string,
    password?: string,
  ) {
    const user = await this.userRepo.findById(userId, workspaceId, {
      includePassword: true,
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.hasGeneratedPassword) {
      return;
    }
    if (
      typeof password !== 'string' ||
      !password ||
      !(await comparePasswordHash(password, user.password))
    ) {
      throw new ForbiddenException('Invalid password');
    }
  }

  private async verifyCode(mfa: any, rawCode: unknown): Promise<boolean> {
    if (typeof rawCode !== 'string') {
      return false;
    }
    const code = rawCode.trim();
    if (/^\d{6}$/.test(code)) {
      return this.verifyTotp(mfa.secret, code);
    }

    // Backup codes are 8 uppercase hex chars; anything else can't match, so
    // skip the (expensive) bcrypt loop for it.
    const backupCode = code.toUpperCase();
    if (!/^[0-9A-F]{8}$/.test(backupCode) || !mfa.backupCodes?.length) {
      return false;
    }
    for (const hash of mfa.backupCodes as string[]) {
      if (await bcrypt.compare(backupCode, hash)) {
        // Atomic removal: of two concurrent requests with the same code,
        // only the one that actually removes it succeeds.
        return this.userMfaRepo.consumeBackupCode(mfa.userId, hash);
      }
    }
    return false;
  }

  private verifyTotp(secret: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  }

  private async generateBackupCodes() {
    const backupCodes = Array.from({ length: 10 }, () =>
      randomBytes(4).toString('hex').toUpperCase(),
    );
    const hashedCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );
    return { backupCodes, hashedCodes };
  }
}
