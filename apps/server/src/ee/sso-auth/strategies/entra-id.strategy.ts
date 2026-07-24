import { Injectable, Logger } from '@nestjs/common';
import { OidcProviderStrategy } from '../oidc-provider-strategy.interface';

@Injectable()
export class EntraIdStrategy implements OidcProviderStrategy {
  private readonly logger = new Logger(EntraIdStrategy.name);
  readonly flavor = 'entra-id' as const;

  getCallbackPath(): string {
    return '/api/sso/EntraId/callback';
  }

  getExtraScopes(): string[] {
    return ['https://graph.microsoft.com/User.Read'];
  }

  normalizeIssuer(issuerUrl: URL): URL {
    // Phòng vệ cho dữ liệu cũ / URL federation metadata dán nhầm từ Azure Portal.
    const match = issuerUrl.pathname.match(
      /^\/([^/]+)\/federationmetadata\/.*federationmetadata\.xml$/i,
    );
    if (match) {
      return new URL(`https://${issuerUrl.hostname}/${match[1]}/v2.0`);
    }
    return issuerUrl;
  }

  async fetchAvatar(
    tokens: { access_token?: string },
  ): Promise<{ buffer: Buffer; mimeType: string } | undefined> {
    if (!tokens.access_token) {
      return undefined;
    }
    try {
      const res = await fetch(
        'https://graph.microsoft.com/v1.0/me/photo/$value',
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      );
      if (res.status === 404) {
        return undefined;
      }
      const contentType = res.headers.get('content-type');
      if (!res.ok || !contentType?.startsWith('image/')) {
        return undefined;
      }
      return {
        buffer: Buffer.from(await res.arrayBuffer()),
        mimeType: contentType,
      };
    } catch (error) {
      this.logger.warn(`Graph avatar fetch failed: ${error}`);
      return undefined;
    }
  }
}
