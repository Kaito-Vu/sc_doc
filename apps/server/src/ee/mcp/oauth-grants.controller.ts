import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

// Stub: OAuth (MCP) is not implemented in this fork, so no grants ever exist.
// Keeps the client's "Authorized apps" tab from hitting a 404.
@Controller('oauth/grants')
export class OAuthGrantsController {
  @HttpCode(HttpStatus.OK)
  @Post()
  list() {
    return [];
  }

  @HttpCode(HttpStatus.OK)
  @Post('revoke')
  revoke() {
    return;
  }
}
