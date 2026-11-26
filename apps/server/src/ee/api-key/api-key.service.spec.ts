import { ApiKeyService, NO_EXPIRY_SECONDS } from './api-key.service';

// Regression: the core JwtAuthGuard reads user.apiKey.scopes; without it every API key got a 403.
describe('ApiKeyService scopes', () => {
  const apiKeyRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'k1', scopes: ['read'], expiresAt: null }),
    touchLastUsed: jest.fn().mockResolvedValue(undefined),
    insert: jest.fn().mockResolvedValue({ id: 'k1' }),
  };
  const tokenService = { generateApiToken: jest.fn().mockResolvedValue('tok') };
  const service = new ApiKeyService(
    apiKeyRepo as any,
    tokenService as any,
    { findById: jest.fn().mockResolvedValue({ id: 'u1' }) } as any,
    { findById: jest.fn().mockResolvedValue({ id: 'w1' }) } as any,
    { log: jest.fn() } as any,
  );

  it('create without expiresAt stores no expiry and signs a ~100 year token', async () => {
    await service.create('w1', { id: 'u1' } as any, { name: 'n', expiresAt: '' });
    expect(apiKeyRepo.insert.mock.calls.at(-1)[0].expiresAt).toBeNull();
    expect(tokenService.generateApiToken.mock.calls.at(-1)[0].expiresIn).toBe(NO_EXPIRY_SECONDS);
  });

  it('validateApiKey exposes the key scopes to the guard', async () => {
    const res = await service.validateApiKey({ apiKeyId: 'k1', workspaceId: 'w1', sub: 'u1' } as any);
    expect(res.apiKey).toEqual({ id: 'k1', scopes: ['read'] });
  });

  it('create stores scopes as a JSON string (jsonb), and omits them when not given', async () => {
    await service.create('w1', { id: 'u1' } as any, { name: 'n', scopes: ['read'] });
    expect(apiKeyRepo.insert.mock.calls[0][0].scopes).toBe('["read"]');
    await service.create('w1', { id: 'u1' } as any, { name: 'n' });
    expect(apiKeyRepo.insert.mock.calls[1][0]).not.toHaveProperty('scopes');
  });
});
