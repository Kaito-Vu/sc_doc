import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common'
import * as jwt from 'jsonwebtoken'

export interface AzureAdConfig {
  tenantId: string
  clientId: string
  clientSecret?: string
  scopes?: string[]
  groupSyncEnabled?: boolean
  groupClaimName?: string
  groupFilters?: string[]
  groupMappingRules?: Record<string, string>
  validateIssuer?: boolean
  validateAudience?: boolean
  requireEmailDomainMatch?: boolean
  allowedEmailDomains?: string[]
}

export interface TokenClaims {
  iss: string
  aud: string | string[]
  tid: string
  email: string
  unique_name?: string
  name?: string
  sub: string
  exp: number
  iat: number
  [key: string]: any
}

export interface UserInfo {
  id: string
  email: string
  name?: string
  groups?: string[]
}

@Injectable()
export class AzureAdService {
  private readonly logger = new Logger(AzureAdService.name)

  buildTokenUrl(tenantId: string): string {
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
  }

  buildAuthorizeUrl(tenantId: string, clientId: string, redirectUri: string, scopes: string[] = ['openid', 'profile', 'email']): string {
    const params = new URLSearchParams()
    params.append('client_id', clientId)
    params.append('redirect_uri', redirectUri)
    params.append('response_type', 'code')
    params.append('scope', scopes.join(' '))
    params.append('response_mode', 'query')
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`
  }

  buildGraphApiUrl(endpoint: string): string {
    return `https://graph.microsoft.com/v1.0${endpoint}`
  }

  extractClaims(token: string): TokenClaims {
    try {
      const decoded = jwt.decode(token, { complete: false }) as TokenClaims
      if (!decoded) {
        throw new BadRequestException('Invalid token format')
      }
      return decoded
    } catch (error) {
      this.logger.error('Failed to decode token:', error)
      throw new BadRequestException('Invalid token format')
    }
  }

  validateTokenExpiry(claims: TokenClaims): void {
    const now = Math.floor(Date.now() / 1000)
    if (!claims.exp) {
      throw new BadRequestException('Token missing exp claim')
    }
    if (now >= claims.exp) {
      throw new UnauthorizedException('Token has expired')
    }
  }

  validateIssuer(claims: TokenClaims, tenantId: string): void {
    const expectedIssuer = `https://login.microsoftonline.com/${tenantId}/v2.0`
    if (claims.iss !== expectedIssuer) {
      this.logger.warn(
        `Issuer mismatch: expected ${expectedIssuer}, got ${claims.iss}`
      )
      throw new UnauthorizedException('Token issuer does not match configured tenant')
    }
  }

  validateAudience(claims: TokenClaims, clientId: string): void {
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
    if (!audiences.includes(clientId)) {
      this.logger.warn(
        `Audience mismatch: expected ${clientId}, got ${audiences.join(', ')}`
      )
      throw new UnauthorizedException('Token audience does not match client ID')
    }
  }

  validateTenant(claims: TokenClaims, tenantId: string): void {
    if (claims.tid !== tenantId) {
      this.logger.warn(
        `Tenant mismatch: expected ${tenantId}, got ${claims.tid}`
      )
      throw new UnauthorizedException('User tenant does not match configured tenant')
    }
  }

  validateToken(token: string, config: AzureAdConfig): TokenClaims {
    const claims = this.extractClaims(token)

    this.validateTokenExpiry(claims)

    if (config.validateIssuer !== false) {
      this.validateIssuer(claims, config.tenantId)
    }

    if (config.validateAudience !== false) {
      this.validateAudience(claims, config.clientId)
    }

    this.validateTenant(claims, config.tenantId)

    return claims
  }

  extractUserInfo(claims: TokenClaims, config: AzureAdConfig): UserInfo {
    if (!claims.email && !claims.unique_name) {
      throw new BadRequestException('Token does not contain email claim')
    }

    const groups = claims[config.groupClaimName || 'groups'] || []

    const userInfo: UserInfo = {
      id: claims.sub,
      email: claims.email || claims.unique_name,
      name: claims.name,
      groups: Array.isArray(groups) ? groups : [],
    }

    if (config.requireEmailDomainMatch && config.allowedEmailDomains) {
      this.validateEmailDomain(userInfo.email, config.allowedEmailDomains)
    }

    return userInfo
  }

  private validateEmailDomain(email: string, allowedDomains: string[]): void {
    if (!allowedDomains.length) {
      return
    }

    const emailDomain = email.split('@')[1]
    if (!allowedDomains.includes(emailDomain)) {
      throw new UnauthorizedException(`Email domain ${emailDomain} is not allowed`)
    }
  }

  async exchangeCodeForToken(
    code: string,
    tenantId: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<{ access_token: string; id_token: string; expires_in?: number }> {
    const tokenUrl = this.buildTokenUrl(tenantId)
    const params = new URLSearchParams()
    params.append('client_id', clientId)
    params.append('client_secret', clientSecret)
    params.append('code', code)
    params.append('redirect_uri', redirectUri)
    params.append('grant_type', 'authorization_code')

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })

      if (!response.ok) {
        const error = await response.text()
        this.logger.error(`Token exchange failed: ${response.status} ${error}`)
        throw new UnauthorizedException('Failed to exchange code for token')
      }

      const data = (await response.json()) as Record<string, any>
      return {
        access_token: data.access_token,
        id_token: data.id_token,
        expires_in: data.expires_in,
      }
    } catch (error) {
      this.logger.error('Token exchange error:', error)
      throw new UnauthorizedException('Failed to exchange code for token')
    }
  }
}
