import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { OAuthGrantsController } from './oauth-grants.controller';

@Module({
  controllers: [McpController, OAuthGrantsController],
})
export class McpModule {}
