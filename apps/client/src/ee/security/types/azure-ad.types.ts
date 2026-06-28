export interface AzureAdConfig {
  tenantId: string
  clientId: string
  clientSecret?: string
  scopes: string[]
  groupSyncEnabled: boolean
  groupClaimName: string
  groupFilters: string[]
  groupMappingRules: Record<string, string>
  validateIssuer: boolean
  validateAudience: boolean
  requireEmailDomainMatch: boolean
  allowedEmailDomains: string[]
}

export interface AzureAdPluginConfig {
  id: string
  pluginId: string
  workspaceId: string
  enabled: boolean
  config: AzureAdConfig
  createdAt?: string
  updatedAt?: string
  version?: number
}

export interface TestConnectionRequest {
  tenantId: string
  clientId: string
  clientSecret: string
}

export interface TestConnectionResponse {
  success: boolean
  message: string
  tenantId?: string
  email?: string
  groupCount?: number
}

export interface AzureAdGroupMapping {
  groupId: string
  groupName?: string
  mappedRole: 'workspace-admin' | 'workspace-member' | 'workspace-viewer'
}
