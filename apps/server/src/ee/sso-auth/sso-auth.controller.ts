import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  Res,
} from '@nestjs/common';
import { SsoAuthService } from './sso-auth.service';
import { OidcAuthService } from './oidc-auth.service';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

@Controller('sso')
export class SsoAuthController {
  private readonly logger = new Logger(SsoAuthController.name);

  constructor(
    private readonly ssoAuthService: SsoAuthService,
    private readonly oidcAuthService: OidcAuthService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('ldap/:providerId/login')
  async ldapLogin(
    @Param('providerId') providerId: string,
    @Body() body: { username: string; password: string },
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.ssoAuthService.ldapLogin(
      providerId,
      body,
      workspace,
      res,
    );

    if (result.requiresMfa || !result.authToken) {
      return { requiresMfa: true };
    }

    res.setCookie('authToken', result.authToken, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
    });
    return {};
  }

  // Manually calling reply.redirect() via @Res() does not reliably produce a
  // 302 in this NestJS+Fastify version combo (verified with a minimal
  // repro): the redirect's status/Location are set synchronously but the
  // actual header flush to the socket happens asynchronously, so it can be
  // silently downgraded to 200 OK with a Location header the browser never
  // follows. @Redirect() (with a dynamic { url, statusCode } return value)
  // goes through Nest's own response pipeline and does not have this issue -
  // this is the verified fix for the "blank white screen" bug.
  //
  // @SkipTransform() is required alongside @Redirect(): the global
  // TransformHttpResponseInterceptor wraps every handler's return value into
  // { data, success, status } before Nest's redirect handler reads it, so
  // without skipping it, `result.url`/`result.statusCode` come back
  // undefined and Nest falls back to the (empty) static @Redirect() config -
  // verified with a repro: 302 status but an empty Location header.
  @SkipTransform()
  @Get('oidc/:providerId/login')
  @Redirect()
  async oidcLogin(
    @Param('providerId') providerId: string,
    @Query('redirect') redirect: string | undefined,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      return await this.startOidcLogin(providerId, redirect, workspace, res);
    } catch (error) {
      this.logger.error(
        `OIDC login failed for provider ${providerId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return {
        url: `${this.environmentService.getAppUrl()}/login?error=sso_failed`,
        statusCode: 302,
      };
    }
  }

  @SkipTransform()
  @Get('oidc/callback')
  @Redirect()
  async oidcCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    return this.finishOidcLogin(code, state, workspace, res, req);
  }

  // Callback riêng cho Entra ID (mục 3.4/EntraIdStrategy.getCallbackPath) -
  // cùng logic xử lý với oidc/callback, provider được resolve từ signed
  // state cookie chứ không phải từ path, nên chỉ cần route riêng để khớp
  // Redirect URI đã đăng ký trên Azure App Registration.
  @SkipTransform()
  @Get('entraid/callback')
  @Redirect()
  async entraIdCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
    @Req() req: FastifyRequest,
  ) {
    return this.finishOidcLogin(code, state, workspace, res, req);
  }

  private async startOidcLogin(
    providerId: string,
    redirect: string | undefined,
    workspace: Workspace,
    res: FastifyReply,
  ): Promise<{ url: string; statusCode: number }> {
    const { url, stateCookie } =
      await this.oidcAuthService.buildAuthorizationUrl(
        providerId,
        workspace.id,
        redirect,
      );
    res.setCookie('oidc_state', stateCookie, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
      secure: this.environmentService.isHttps(),
    });
    return { url, statusCode: 302 };
  }

  private async finishOidcLogin(
    code: string,
    state: string,
    workspace: Workspace,
    res: FastifyReply,
    req: FastifyRequest,
  ): Promise<{ url: string; statusCode: number }> {
    const appUrl = this.environmentService.getAppUrl();
    const stateCookie = req.cookies?.['oidc_state'];
    try {
      if (!code || !state || !stateCookie) {
        throw new Error(
          `Missing OIDC callback parameters (code=${!!code}, state=${!!state}, oidc_state cookie=${!!stateCookie}, cookies received=${Object.keys(req.cookies ?? {}).join(',') || 'none'})`,
        );
      }
      const result = await this.oidcAuthService.handleCallback({
        code,
        state,
        stateCookie,
        workspaceId: workspace.id,
        workspace,
        res,
      });
      res.clearCookie('oidc_state', { path: '/' });

      if (result.requiresMfa || !result.authToken) {
        return { url: `${appUrl}/login/mfa`, statusCode: 302 };
      }

      res.setCookie('authToken', result.authToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: this.environmentService.getCookieExpiresIn(),
        secure: this.environmentService.isHttps(),
      });
      return { url: `${appUrl}${result.redirect ?? '/'}`, statusCode: 302 };
    } catch (error) {
      this.logger.error(
        `OIDC callback failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      res.clearCookie('oidc_state', { path: '/' });
      return { url: `${appUrl}/login?error=sso_failed`, statusCode: 302 };
    }
  }
}
