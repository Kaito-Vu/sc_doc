import { FastifyReply } from 'fastify';
import { EnvironmentService } from '../../integrations/environment/environment.service';

// Single source of truth for the auth/MFA cookies set by the EE login flows.

export function setMfaCookie(
  res: FastifyReply,
  env: EnvironmentService,
  token: string,
) {
  res.setCookie('mfaToken', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(Date.now() + 5 * 60 * 1000),
    secure: env.isHttps(),
  });
}

export function setAuthCookie(
  res: FastifyReply,
  env: EnvironmentService,
  token: string,
) {
  res.setCookie('authToken', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: env.getCookieExpiresIn(),
    secure: env.isHttps(),
  });
}
