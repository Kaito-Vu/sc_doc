import { Injectable } from '@nestjs/common';
import { HookContext } from '../../../../core/plugins/plugin-hooks';
import {
  SessionGuardHookContext,
  SessionGuardService,
} from '../session-guard.service';

@Injectable()
export class AfterSessionCreatedHandler {
  constructor(private readonly sessionGuardService: SessionGuardService) {}

  async handle(context: HookContext): Promise<HookContext> {
    await this.sessionGuardService.onSessionCreated(
      context as unknown as SessionGuardHookContext,
    );
    return context;
  }
}
