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

  @SkipTransform()
  @Get('oidc/:providerId/login')
  async oidcLogin(
    @Param('providerId') providerId: string,
    @Query('redirect') redirect: string | undefined,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    try {
      await this.startOidcLogin(providerId, redirect, workspace, res);
    } catch (error) {
      this.logger.error(
        `OIDC login failed for provider ${providerId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      res.redirect(`${this.environmentService.getAppUrl()}/login?error=sso_failed`);
    }
  }

  @SkipTransform()
  @Get('oidc/callback')
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
  ) {
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
    });
    // Do NOT `return res.redirect(url)` here: Fastify's reply.redirect()
    // returns `this` (the reply instance), and with @Res({passthrough:true})
    // Nest treats any non-undefined return value as a body to additionally
    // send, re-serializing the response with its own default 200 status -
    // silently overwriting the 302 + Location header redirect() already set,
    // so the browser receives 200 OK with a Location header it never
    // follows (this is exactly the "blank white screen" bug). Call
    // redirect() as a side effect and return nothing.
    res.redirect(url);
  }

  private async finishOidcLogin(
    code: string,
    state: string,
    workspace: Workspace,
    res: FastifyReply,
    req: FastifyRequest,
  ) {
    const appUrl = this.environmentService.getAppUrl();
    const stateCookie = req.cookies?.['oidc_state'];
    try {
      if (!code || !state || !stateCookie) {
        throw new Error('Missing OIDC callback parameters');
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
        res.redirect(`${appUrl}/login/mfa`);
        return;
      }

      res.setCookie('authToken', result.authToken, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: this.environmentService.getCookieExpiresIn(),
        secure: this.environmentService.isHttps(),
      });
      // See the comment in startOidcLogin: do not return the redirect() call.
      res.redirect(`${appUrl}${result.redirect ?? '/'}`);
    } catch (error) {
      this.logger.error(
        `OIDC callback failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      res.clearCookie('oidc_state', { path: '/' });
      res.redirect(`${appUrl}/login?error=sso_failed`);
    }
  }
}
