import { Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import * as jwt from 'jsonwebtoken'

export interface JwksKey {
  kty: string
  use?: string
  kid: string
  n: string
  e: string
  [key: string]: any
}

export interface AzureJwks {
  keys: JwksKey[]
}

@Injectable()
export class TokenValidationService {
  private readonly logger = new Logger(TokenValidationService.name)
  private jwksCache: Map<string, { keys: JwksKey[]; expiresAt: number }> = new Map()
  private readonly JWKS_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

  async fetchAzureJwks(tenantId: string): Promise<AzureJwks> {
    const cacheKey = `jwks-${tenantId}`
    const cached = this.jwksCache.get(cacheKey)

    if (cached && cached.expiresAt > Date.now()) {
      return { keys: cached.keys }
    }

    try {
      const url = `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Failed to fetch JWKS: ${response.status}`)
      }

      const jwks = (await response.json()) as AzureJwks

      this.jwksCache.set(cacheKey, {
        keys: jwks.keys,
        expiresAt: Date.now() + this.JWKS_CACHE_TTL,
      })

      return jwks
    } catch (error) {
      this.logger.error('Failed to fetch Azure JWKS:', error)
      throw new UnauthorizedException('Unable to verify token signature')
    }
  }

  private getKeyFromJwks(
    jwks: AzureJwks,
    token: string
  ): JwksKey | undefined {
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      return undefined
    }

    return jwks.keys.find((key) => key.kid === decoded.header.kid)
  }

  private buildPublicKey(key: JwksKey): string {
    if (key.kty !== 'RSA') {
      throw new UnauthorizedException('Unsupported key type')
    }

    try {
      const crypto = require('crypto')
      const publicKeyObject = crypto.createPublicKey({
        key: {
          kty: key.kty,
          n: Buffer.from(key.n, 'base64'),
          e: Buffer.from(key.e, 'base64'),
        },
        format: 'jwk',
      })

      return publicKeyObject.export({ format: 'pem', type: 'spki' })
    } catch (error) {
      this.logger.error('Failed to build public key:', error)
      throw new UnauthorizedException('Unable to verify token signature')
    }
  }

  async verifyTokenSignature(token: string, tenantId: string): Promise<any> {
    try {
      const jwks = await this.fetchAzureJwks(tenantId)
      const key = this.getKeyFromJwks(jwks, token)

      if (!key) {
        throw new UnauthorizedException('Token signing key not found')
      }

      const publicKey = this.buildPublicKey(key)

      const verified = jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
      })

      return verified
    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        this.logger.warn(`JWT verification failed: ${error.message}`)
        throw new UnauthorizedException(`Invalid token: ${error.message}`)
      }
      throw error
    }
  }

  extractTokenHeader(token: string): any {
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded || typeof decoded === 'string') {
      return null
    }
    return decoded.header
  }

  isTokenExpired(token: string): boolean {
    const decoded = jwt.decode(token) as any
    if (!decoded || !decoded.exp) {
      return true
    }

    const now = Math.floor(Date.now() / 1000)
    return now >= decoded.exp
  }
}
