import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ScimTokenService } from './scim-token.service';

@Injectable()
export class ScimAuthGuard implements CanActivate {
  constructor(private readonly scimTokenService: ScimTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const auth = req.headers?.authorization as string | undefined;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('SCIM bearer token required');
    }
    const raw = auth.slice('Bearer '.length).trim();
    const token = await this.scimTokenService.validateToken(raw);
    req.scimWorkspaceId = token.workspaceId;
    return true;
  }
}
