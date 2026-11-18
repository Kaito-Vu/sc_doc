import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

// POST /api/workspace/invites/{create,resend,accept,link}
const INVITE_ROUTE = /\/workspace\/invites\/(create|resend|accept|link)\/?$/;

/**
 * Workspace invitations are switched off in this deployment.
 * Registered globally (APP_GUARD) from ee so the core controller stays untouched.
 */
@Injectable()
export class InvitesDisabledGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest();
    const path = String(req.raw?.url ?? req.url ?? '').split('?')[0];
    if (INVITE_ROUTE.test(path)) {
      throw new ForbiddenException('Workspace invitations are disabled');
    }
    return true;
  }
}
