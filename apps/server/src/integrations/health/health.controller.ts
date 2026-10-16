import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PostgresHealthIndicator } from './postgres.health';
import { RedisHealthIndicator } from './redis.health';
import { BUILD_VERSION } from '../../ee/versioning/build-version';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private postgres: PostgresHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  @SkipTransform()
  @Get()
  @HealthCheck()
  async check() {
    const result = await this.health.check([
      () => this.postgres.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
    ]);
    return { ...result, version: BUILD_VERSION };
  }

  @Get('live')
  async checkLive() {
    return 'ok';
  }
}
