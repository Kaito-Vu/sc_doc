export interface OidcProviderStrategy {
  readonly flavor: 'generic' | 'entra-id';

  /** Path (không kèm domain) dùng làm redirect_uri và route callback. */
  getCallbackPath(): string;

  getExtraScopes(): string[];

  normalizeIssuer(issuerUrl: URL): URL;

  fetchAvatar(
    tokens: { access_token?: string },
  ): Promise<{ buffer: Buffer; mimeType: string } | undefined>;
}
