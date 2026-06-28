import { Injectable, Logger } from '@nestjs/common'

interface CachedToken {
  token: string
  expiresAt: number
}

@Injectable()
export class TokenCacheService {
  private readonly logger = new Logger(TokenCacheService.name)
  private tokenCache = new Map<string, CachedToken>()

  cacheToken(
    key: string,
    token: string,
    expiresIn?: number
  ): void {
    // Default to 1 hour if expires_in not provided
    const ttlMs = (expiresIn || 3600) * 1000
    const expiresAt = Date.now() + ttlMs

    this.tokenCache.set(key, {
      token,
      expiresAt,
    })

    this.logger.debug(`Cached token for key: ${key}`)
  }

  getToken(key: string): string | null {
    const cached = this.tokenCache.get(key)

    if (!cached) {
      return null
    }

    if (cached.expiresAt < Date.now()) {
      this.tokenCache.delete(key)
      return null
    }

    return cached.token
  }

  clearToken(key: string): void {
    this.tokenCache.delete(key)
  }

  clearAllTokens(): void {
    this.tokenCache.clear()
    this.logger.debug('Cleared all cached tokens')
  }

  // Cleanup expired tokens periodically (called by cleanup job)
  cleanupExpiredTokens(): number {
    let cleaned = 0
    const now = Date.now()

    for (const [key, cached] of this.tokenCache.entries()) {
      if (cached.expiresAt < now) {
        this.tokenCache.delete(key)
        cleaned++
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} expired tokens`)
    }

    return cleaned
  }
}
