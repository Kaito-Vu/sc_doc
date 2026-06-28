import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AI_CHAT_THROTTLER,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './services/auth.service';
import { SessionService } from '../session/session.service';
import { SetupGuard } from './guards/setup.guard';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { PasswordResetDto } from './dto/password-reset.dto';
import { VerifyUserTokenDto } from './dto/verify-user-token.dto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { validateSsoEnforcement } from './auth.util';
import { ModuleRef } from '@nestjs/core';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { CoreHooks } from '../plugins/plugin-hooks';
import { runHook } from '../plugins/run-hook';

@SkipThrottle({ [AI_CHAT_THROTTLER]: true })
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly environmentService: EnvironmentService,
    private readonly moduleRef: ModuleRef,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
    @Req() req: FastifyRequest,
    @Body() loginInput: LoginDto,
  ) {
    validateSsoEnforcement(workspace);

    let loginContext: any = {
      loginInput,
      workspaceId: workspace.id,
      remoteAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    loginContext = await runHook(CoreHooks.BEFORE_LOGIN, loginContext);

    let MfaModule: any;
    let isMfaModuleReady = false;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      MfaModule = require('./../../ee/mfa/services/mfa.service');
      isMfaModuleReady = true;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'MODULE_NOT_FOUND') {
        throw err;
      }
      this.logger.debug(
        'MFA module requested but EE module not bundled in this build',
      );
      isMfaModuleReady = false;
    }
    if (isMfaModuleReady) {
      const mfaService = this.moduleRef.get(MfaModule.MfaService, {
        strict: false,
      });

      const mfaResult = await mfaService.checkMfaRequirements(
        loginContext.loginInput,
        workspace,
        res,
      );

      if (mfaResult) {
        // If user has MFA enabled OR workspace enforces MFA, require MFA verification
        if (mfaResult.userHasMfa || mfaResult.requiresMfaSetup) {
          return {
            userHasMfa: mfaResult.userHasMfa,
            requiresMfaSetup: mfaResult.requiresMfaSetup,
            isMfaEnforced: mfaResult.isMfaEnforced,
          };
        } else if (mfaResult.authToken) {
          // User doesn't have MFA and workspace doesn't require it
          this.setAuthCookie(res, mfaResult.authToken);
          return;
        }
      }
    }

    const authToken = await this.authService.login(
      loginContext.loginInput,
      workspace.id,
    );
    this.setAuthCookie(res, authToken);

    await runHook(CoreHooks.AFTER_LOGIN, {
      loginInput: loginContext.loginInput,
      workspaceId: workspace.id,
    });
  }

  @UseGuards(SetupGuard)
  @HttpCode(HttpStatus.OK)
  @Post('setup')
  async setupWorkspace(
    @Res({ passthrough: true }) res: FastifyReply,
    @Req() req: FastifyRequest,
    @Body() createAdminUserDto: CreateAdminUserDto,
  ) {
    let signupContext: any = {
      signupInput: createAdminUserDto,
      remoteAddress: req.ip,
      userAgent: req.headers['user-agent'],
    };

    signupContext = await runHook(CoreHooks.BEFORE_SIGNUP, signupContext);

    const { workspace, authToken } =
      await this.authService.setup(signupContext.signupInput);

    this.setAuthCookie(res, authToken);

    await runHook(CoreHooks.AFTER_SIGNUP, {
      workspace,
      createAdminUserDto: signupContext.signupInput,
    });

    return workspace;
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    const currentSessionId = (req.raw as any).sessionId;
    return this.authService.changePassword(
      dto,
      user.id,
      workspace.id,
      currentSessionId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    validateSsoEnforcement(workspace);

    const forgotPasswordContext = await runHook(
      CoreHooks.BEFORE_FORGOT_PASSWORD,
      {
        forgotPasswordInput: {
          email: forgotPasswordDto.email,
          recaptchaToken: forgotPasswordDto.recaptchaToken,
        },
        workspaceId: workspace.id,
        remoteAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );

    return this.authService.forgotPassword(
      forgotPasswordContext.forgotPasswordInput,
      workspace,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('password-reset')
  async passwordReset(
    @Res({ passthrough: true }) res: FastifyReply,
    @Body() passwordResetDto: PasswordResetDto,
    @AuthWorkspace() workspace: Workspace,
    @Req() req: FastifyRequest,
  ) {
    const passwordResetContext = await runHook(
      CoreHooks.BEFORE_PASSWORD_RESET,
      {
        passwordResetInput: {
          token: passwordResetDto.token,
          newPassword: passwordResetDto.newPassword,
          recaptchaToken: passwordResetDto.recaptchaToken,
        },
        workspaceId: workspace.id,
        remoteAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );

    const result = await this.authService.passwordReset(
      passwordResetContext.passwordResetInput,
      workspace,
    );

    if (result.requiresLogin) {
      return {
        requiresLogin: true,
      };
    }

    // Set auth cookie if no MFA is required
    this.setAuthCookie(res, result.authToken);
    return {
      requiresLogin: false,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('verify-token')
  async verifyResetToken(
    @Body() verifyUserTokenDto: VerifyUserTokenDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.authService.verifyUserToken(verifyUserTokenDto, workspace.id);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('collab-token')
  async collabToken(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.authService.getCollabToken(user, workspace.id);
  }

  @SkipThrottle({ [AUTH_THROTTLER]: true })
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(
    @AuthUser() user: User,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const sessionId = (req.raw as any).sessionId;
    if (sessionId) {
      await this.sessionService.revokeSession(
        sessionId,
        user.id,
        user.workspaceId,
      );
    }

    res.clearCookie('authToken');

    this.auditService.log({
      event: AuditEvent.USER_LOGOUT,
      resourceType: AuditResource.USER,
      resourceId: user.id,
    });
  }

  setAuthCookie(res: FastifyReply, token: string) {
    res.setCookie('authToken', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });
  }
}
