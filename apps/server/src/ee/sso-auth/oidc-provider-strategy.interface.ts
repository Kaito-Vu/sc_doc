export interface OidcProviderStrategy {
  readonly flavor: 'generic' | 'entra-id';

  getExtraScopes(): string[];

  normalizeIssuer(issuerUrl: URL): URL;

  fetchAvatar(
    tokens: { access_token?: string },
  ): Promise<{ buffer: Buffer; mimeType: string } | undefined>;
}
