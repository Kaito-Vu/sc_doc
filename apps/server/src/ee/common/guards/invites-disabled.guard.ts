import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Workspace invitations are switched off in this deployment.
 * Applied to the invite endpoints in the workspace controller.
 */
@Injectable()
export class InvitesDisabledGuard implements CanActivate {
  canActivate(): boolean {
    throw new ForbiddenException('Workspace invitations are disabled');
  }
}
