import { Test, TestingModule } from '@nestjs/testing'
import { AzureAdService, AzureAdConfig } from '../services/azure-ad.service'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import * as jwt from 'jsonwebtoken'

describe('AzureAdService', () => {
  let service: AzureAdService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AzureAdService],
    }).compile()

    service = module.get<AzureAdService>(AzureAdService)
  })

  describe('buildTokenUrl', () => {
    it('should build correct token URL', () => {
      const tenantId = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
      const url = service.buildTokenUrl(tenantId)
      expect(url).toBe(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
      )
    })
  })

  describe('extractClaims', () => {
    it('should extract claims from valid token', () => {
      const claims = {
        sub: 'user-id-123',
        email: 'user@example.com',
        tid: 'tenant-id-123',
        iss: 'https://login.microsoftonline.com/tenant-id-123/v2.0',
        aud: 'client-id-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      }

      const token = jwt.sign(claims, 'secret')
      const extracted = service.extractClaims(token)

      expect(extracted.sub).toBe('user-id-123')
      expect(extracted.email).toBe('user@example.com')
      expect(extracted.tid).toBe('tenant-id-123')
    })

    it('should throw error for invalid token', () => {
      expect(() => {
        service.extractClaims('invalid-token')
      }).toThrow(BadRequestException)
    })
  })

  describe('validateTokenExpiry', () => {
    it('should validate non-expired token', () => {
      const claims = {
        exp: Math.floor(Date.now() / 1000) + 3600,
      } as any

      expect(() => {
        service.validateTokenExpiry(claims)
      }).not.toThrow()
    })

    it('should throw for expired token', () => {
      const claims = {
        exp: Math.floor(Date.now() / 1000) - 100,
      } as any

      expect(() => {
        service.validateTokenExpiry(claims)
      }).toThrow(UnauthorizedException)
    })

    it('should throw for missing exp claim', () => {
      const claims = {} as any

      expect(() => {
        service.validateTokenExpiry(claims)
      }).toThrow(BadRequestException)
    })
  })

  describe('validateIssuer', () => {
    it('should validate correct issuer', () => {
      const tenantId = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
      const claims = {
        iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
      } as any

      expect(() => {
        service.validateIssuer(claims, tenantId)
      }).not.toThrow()
    })

    it('should throw for incorrect issuer', () => {
      const claims = {
        iss: 'https://login.microsoftonline.com/wrong-tenant/v2.0',
      } as any

      expect(() => {
        service.validateIssuer(claims, 'correct-tenant')
      }).toThrow(UnauthorizedException)
    })
  })

  describe('validateAudience', () => {
    it('should validate correct audience', () => {
      const clientId = 'client-id-123'
      const claims = {
        aud: clientId,
      } as any

      expect(() => {
        service.validateAudience(claims, clientId)
      }).not.toThrow()
    })

    it('should validate array audience', () => {
      const clientId = 'client-id-123'
      const claims = {
        aud: ['other-id', clientId, 'another-id'],
      } as any

      expect(() => {
        service.validateAudience(claims, clientId)
      }).not.toThrow()
    })

    it('should throw for incorrect audience', () => {
      const claims = {
        aud: 'wrong-client-id',
      } as any

      expect(() => {
        service.validateAudience(claims, 'correct-client-id')
      }).toThrow(UnauthorizedException)
    })
  })

  describe('validateTenant', () => {
    it('should validate correct tenant', () => {
      const tenantId = 'tenant-id-123'
      const claims = {
        tid: tenantId,
      } as any

      expect(() => {
        service.validateTenant(claims, tenantId)
      }).not.toThrow()
    })

    it('should throw for incorrect tenant', () => {
      const claims = {
        tid: 'wrong-tenant-id',
      } as any

      expect(() => {
        service.validateTenant(claims, 'correct-tenant-id')
      }).toThrow(UnauthorizedException)
    })
  })

  describe('extractUserInfo', () => {
    it('should extract user info from claims', () => {
      const config: AzureAdConfig = {
        tenantId: 'tenant-id',
        clientId: 'client-id',
        groupClaimName: 'groups',
      }

      const claims = {
        sub: 'user-id-123',
        email: 'user@example.com',
        name: 'Test User',
        groups: ['group-1', 'group-2'],
      } as any

      const userInfo = service.extractUserInfo(claims, config)

      expect(userInfo.id).toBe('user-id-123')
      expect(userInfo.email).toBe('user@example.com')
      expect(userInfo.name).toBe('Test User')
      expect(userInfo.groups).toEqual(['group-1', 'group-2'])
    })

    it('should throw for missing email', () => {
      const config: AzureAdConfig = {
        tenantId: 'tenant-id',
        clientId: 'client-id',
      }

      const claims = {
        sub: 'user-id-123',
      } as any

      expect(() => {
        service.extractUserInfo(claims, config)
      }).toThrow(BadRequestException)
    })
  })

  describe('validateToken', () => {
    it('should validate complete token', () => {
      const config: AzureAdConfig = {
        tenantId: 'tenant-id-123',
        clientId: 'client-id-123',
        validateIssuer: true,
        validateAudience: true,
      }

      const claims = {
        sub: 'user-id-123',
        email: 'user@example.com',
        tid: 'tenant-id-123',
        iss: 'https://login.microsoftonline.com/tenant-id-123/v2.0',
        aud: 'client-id-123',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }

      const token = jwt.sign(claims, 'secret')
      const result = service.validateToken(token, config)

      expect(result.sub).toBe('user-id-123')
    })
  })
})
