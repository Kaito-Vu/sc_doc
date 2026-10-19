import { UseGuards, applyDecorators } from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  AUTH_THROTTLER,
} from '../../integrations/throttle/throttler-names';

/**
 * Applies only the per-IP auth throttler (same limit as core /auth/login) to
 * a credential-guessing endpoint such as a password or MFA code check.
 */
export const AuthThrottle = () =>
  applyDecorators(
    SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [AUTH_THROTTLER]: false }),
    UseGuards(ThrottlerGuard),
  );
