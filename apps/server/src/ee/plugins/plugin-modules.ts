import { PageLockModule } from '../page-lock/page-lock.module';
import { SpaceAccessRequestModule } from '../space-access-request/space-access-request.module';
import { SessionGuardModule } from './session-guard/session-guard.module';
import { IpAllowlistModule } from './ip-allowlist/ip-allowlist.module';

// The one place a new plugin's Nest module is registered.
export const PLUGIN_MODULES = [
  PageLockModule,
  SpaceAccessRequestModule,
  SessionGuardModule,
  IpAllowlistModule,
];
