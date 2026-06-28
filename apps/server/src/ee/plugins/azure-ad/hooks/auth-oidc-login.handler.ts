import { Injectable, Logger } from '@nestjs/common'
import { AzureAdService, AzureAdConfig } from '../services/azure-ad.service'
import { TokenValidationService } from '../services/token-validation.service'
import { GroupSyncService } from '../services/group-sync.service'
import { AvatarSyncService } from '../services/avatar-sync.service'

export interface OidcLoginContext {
  providerId: string
  code?: string
  state?: string
  idToken: string
  accessToken?: string
  workspaceId: string
  config?: AzureAdConfig
}

export interface OidcLoginResult {
  userInfo: {
    id: string
    email: string
    name?: string
  }
  groups?: string[]
  groupMapping?: string[]
  tokenClaims?: Record<string, any>
  avatar?: string
}

@Injectable()
export class AuthOidcLoginHandler {
  private readonly logger = new Logger(AuthOidcLoginHandler.name)

  constructor(
    private readonly azureAdService: AzureAdService,
    private readonly tokenValidationService: TokenValidationService,
    private readonly groupSyncService: GroupSyncService,
    private readonly avatarSyncService: AvatarSyncService
  ) {}

  async handle(context: OidcLoginContext): Promise<OidcLoginResult> {
    this.logger.debug(
      `[Azure AD] Processing OIDC login for provider ${context.providerId}`
    )

    if (!context.config) {
      this.logger.warn('No Azure AD config found, skipping validation')
      return this.extractBasicUserInfo(context.idToken)
    }

    // Verify token signature
    let tokenClaims: any
    try {
      await this.tokenValidationService.verifyTokenSignature(
        context.idToken,
        context.config.tenantId
      )
      this.logger.debug('Token signature verified')
    } catch (error) {
      this.logger.error('Token signature verification failed:', error)
      throw error
    }

    // Validate token claims
    try {
      tokenClaims = this.azureAdService.validateToken(
        context.idToken,
        context.config
      )
      this.logger.debug('Token claims validated')
    } catch (error) {
      this.logger.error('Token validation failed:', error)
      throw error
    }

    // Extract user info
    const userInfo = this.azureAdService.extractUserInfo(
      tokenClaims,
      context.config
    )

    this.logger.debug(
      `User authenticated: ${userInfo.email} (ID: ${userInfo.id})`
    )

    const result: OidcLoginResult = {
      userInfo,
      tokenClaims,
    }

    // Fetch and sync groups if enabled
    if (context.config.groupSyncEnabled && context.accessToken) {
      try {
        const groups = await this.groupSyncService.fetchUserGroups(
          context.accessToken
        )

        this.logger.debug(`Fetched ${groups.length} groups from Microsoft Graph`)

        const syncResult = this.groupSyncService.syncGroupsResult(
          groups,
          context.config.groupMappingRules,
          context.config.groupFilters
        )

        result.groups = syncResult.groupIds
        result.groupMapping = syncResult.mappedRoles

        this.logger.debug(
          `Synced ${syncResult.groupIds.length} groups, mapped to ${syncResult.mappedRoles.length} roles`
        )
      } catch (error) {
        this.logger.error('Failed to sync groups, continuing without groups:', error)
        // Don't fail the entire login if group sync fails
      }
    }

    // Fetch and sync avatar if enabled
    if (context.config.avatarSyncEnabled && context.accessToken) {
      try {
        const photoResult = await this.avatarSyncService.fetchUserPhoto(
          context.accessToken,
          'base64'
        )

        if (photoResult.synced && photoResult.photoBase64) {
          result.avatar = photoResult.photoBase64
          this.logger.debug('Successfully synced user avatar')
        }
      } catch (error) {
        this.logger.error('Failed to sync avatar, continuing without avatar:', error)
        // Don't fail the entire login if avatar sync fails
      }
    }

    return result
  }

  private extractBasicUserInfo(idToken: string): OidcLoginResult {
    const claims = this.azureAdService.extractClaims(idToken)

    return {
      userInfo: {
        id: claims.sub,
        email: claims.email || claims.unique_name,
        name: claims.name,
      },
      tokenClaims: claims,
    }
  }
}
