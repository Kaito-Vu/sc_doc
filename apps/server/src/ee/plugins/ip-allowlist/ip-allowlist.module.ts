import { ForbiddenException, Module, OnModuleInit } from '@nestjs/common';
import { HookRegistry } from '../services/hook.registry';
import { PluginConfigService } from '../services/plugin-config.service';
import { CoreHooks } from '../../../core/plugins/plugin-hooks';
import { isTrustedIp } from '../session-guard/session-guard.exemptions';

const PLUGIN_ID = 'ip-allowlist';

@Module({})
export class IpAllowlistModule implements OnModuleInit {
  constructor(
    private readonly hookRegistry: HookRegistry,
    private readonly pluginConfig: PluginConfigService,
  ) {}

  onModuleInit(): void {
    this.hookRegistry.on(CoreHooks.BEFORE_LOGIN, async (context) => {
      const { enabled, config } = await this.pluginConfig.getConfig(
        context.workspaceId,
        PLUGIN_ID,
      );
      const allowed = config?.allowedIps;
      // ponytail: empty list = no restriction (avoids locking everyone out);
      // only sign-in is checked, already-issued sessions are not re-checked.
      if (!enabled || !Array.isArray(allowed) || allowed.length === 0) {
        return context;
      }
      if (!isTrustedIp(context.remoteAddress ?? null, allowed)) {
        throw new ForbiddenException('Sign-in is not allowed from this IP');
      }
      return context;
    });
  }
}
