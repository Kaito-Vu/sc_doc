import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common'
import { InjectKysely } from 'nestjs-kysely'
import { Kysely } from 'kysely'
import { PluginRegistry } from './plugin.registry'

export interface PluginConfigData {
  id: string | null
  workspaceId: string
  pluginId: string
  enabled: boolean
  config: Record<string, any>
  version: number
  createdAt?: Date
  updatedAt?: Date
}

@Injectable()
export class PluginConfigService {
  private readonly logger = new Logger(PluginConfigService.name)

  constructor(
    @InjectKysely() private readonly db: Kysely<any>,
    private readonly registry: PluginRegistry,
  ) {}

  async getConfig(
    workspaceId: string,
    pluginId: string,
  ): Promise<PluginConfigData> {
    const plugin = this.registry.getPlugin(pluginId)
    if (!plugin) {
      throw new NotFoundException(`Plugin ${pluginId} not found`)
    }

    const config = await this.db
      .selectFrom('plugin_configurations')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('plugin_id', '=', pluginId)
      .executeTakeFirst()

    if (!config) {
      return {
        id: null,
        workspaceId,
        pluginId,
        enabled: false,
        config: {},
        version: 0,
      }
    }

    return {
      id: config.id,
      workspaceId: config.workspace_id,
      pluginId: config.plugin_id,
      enabled: config.enabled,
      config: config.config || {},
      version: config.version,
      createdAt: config.created_at,
      updatedAt: config.updated_at,
    }
  }

  async updateConfig(
    workspaceId: string,
    pluginId: string,
    updates: {
      enabled?: boolean
      config?: Record<string, any>
    },
    userId?: string,
  ): Promise<PluginConfigData> {
    this.logger.log(`[UpdateConfig] Starting update - workspaceId: ${workspaceId}, pluginId: ${pluginId}, updates:`, updates)
    const plugin = this.registry.getPlugin(pluginId)
    if (!plugin) {
      this.logger.error(`[UpdateConfig] Plugin not found: ${pluginId}`)
      throw new NotFoundException(`Plugin ${pluginId} not found`)
    }

    // Validate config if provided
    if (updates.config && plugin.configSchema) {
      const validation = this.validateConfig(
        updates.config,
        plugin.configSchema,
      )
      if (!validation.valid) {
        this.logger.error(`[UpdateConfig] Validation failed:`, validation.errors)
        throw new BadRequestException({
          message: 'Invalid configuration',
          errors: validation.errors,
        })
      }
    }

    const result = await this.upsertConfigWithRetry(
      workspaceId,
      pluginId,
      updates,
      userId,
    )

    this.logger.log(
      `Plugin ${pluginId} config updated in workspace ${workspaceId}`,
    )

    return {
      id: result.id,
      workspaceId: result.workspace_id,
      pluginId: result.plugin_id,
      enabled: result.enabled,
      config: result.config || {},
      version: result.version,
      updatedAt: result.updated_at,
    }
  }

  /**
   * Upserts with optimistic locking on `version`. Two near-simultaneous
   * requests (e.g. a double-fired toggle click) would otherwise both read
   * the same `existing` row and the second write would silently overwrite
   * the first using a stale snapshot (lost update). Checking `version` in
   * the WHERE clause makes the second write fail to match a row, so we
   * retry against the now-current row instead of clobbering it.
   */
  private async upsertConfigWithRetry(
    workspaceId: string,
    pluginId: string,
    updates: { enabled?: boolean; config?: Record<string, any> },
    userId?: string,
    attempt = 0,
  ): Promise<any> {
    const existing = await this.db
      .selectFrom('plugin_configurations')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .where('plugin_id', '=', pluginId)
      .executeTakeFirst()

    if (existing) {
      const existingConfig = existing.config || {}
      const nextConfig = updates.config
        ? {
            ...existingConfig,
            ...Object.fromEntries(
              Object.entries(updates.config).filter(
                ([, value]) => value !== undefined && value !== '',
              ),
            ),
          }
        : existingConfig

      const result = await this.db
        .updateTable('plugin_configurations')
        .set({
          enabled: updates.enabled ?? existing.enabled,
          config: nextConfig,
          updated_at: new Date(),
          updated_by: userId || existing.updated_by,
          version: existing.version + 1,
        })
        .where('id', '=', existing.id)
        .where('version', '=', existing.version)
        .returningAll()
        .executeTakeFirst()

      if (!result) {
        if (attempt >= 3) {
          throw new Error(
            `Failed to update plugin ${pluginId} config after ${attempt} retries due to concurrent updates`,
          )
        }
        this.logger.warn(
          `[UpdateConfig] Version conflict for ${pluginId} (expected version ${existing.version}), retrying (attempt ${attempt + 1})`,
        )
        return this.upsertConfigWithRetry(
          workspaceId,
          pluginId,
          updates,
          userId,
          attempt + 1,
        )
      }

      return result
    }

    try {
      return await this.db
        .insertInto('plugin_configurations')
        .values({
          workspace_id: workspaceId,
          plugin_id: pluginId,
          enabled: updates.enabled ?? false,
          config: updates.config || {},
          created_by: userId,
          updated_by: userId,
          version: 1,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    } catch (error) {
      // Unique constraint on (workspace_id, plugin_id): another concurrent
      // request inserted the row first. Retry as an update against it.
      if (attempt >= 3) throw error
      return this.upsertConfigWithRetry(
        workspaceId,
        pluginId,
        updates,
        userId,
        attempt + 1,
      )
    }
  }

  async togglePlugin(
    workspaceId: string,
    pluginId: string,
    enabled: boolean,
    userId?: string,
  ): Promise<PluginConfigData> {
    this.logger.log(`[TogglePlugin] workspaceId: ${workspaceId}, pluginId: ${pluginId}, enabled: ${enabled}`)
    const plugin = this.registry.getPlugin(pluginId)
    if (!plugin) {
      this.logger.error(`[TogglePlugin] Plugin not found: ${pluginId}`)
      throw new NotFoundException(`Plugin ${pluginId} not found`)
    }

    this.logger.log(`[TogglePlugin] Calling updateConfig...`)
    const result = await this.updateConfig(workspaceId, pluginId, { enabled }, userId)
    this.logger.log(`[TogglePlugin] updateConfig result:`, result)
    return result
  }

  isConfigured(
    configSchema: Record<string, any> | undefined,
    config: Record<string, any>,
  ): boolean {
    if (!configSchema?.properties) {
      return true
    }

    for (const [key, propDef] of Object.entries(configSchema.properties)) {
      const prop = propDef as { required?: boolean }
      if (!prop.required) continue

      const value = config[key]
      if (value === undefined || value === null || value === '') {
        return false
      }
    }

    return true
  }

  async listConfigs(workspaceId: string): Promise<PluginConfigData[]> {
    const configs = await this.db
      .selectFrom('plugin_configurations')
      .selectAll()
      .where('workspace_id', '=', workspaceId)
      .orderBy('created_at', 'desc')
      .execute()

    return configs.map((cfg) => ({
      id: cfg.id,
      workspaceId: cfg.workspace_id,
      pluginId: cfg.plugin_id,
      enabled: cfg.enabled,
      config: cfg.config || {},
      version: cfg.version,
      createdAt: cfg.created_at,
      updatedAt: cfg.updated_at,
    }))
  }

  private validateConfig(
    config: Record<string, any>,
    schema: Record<string, any>,
  ): { valid: boolean; errors?: string[] } {
    if (!schema.properties) {
      return { valid: true }
    }

    const errors = Object.entries(schema.properties).flatMap(
      ([key, propDef]) => {
        const error = this.validateConfigField(key, propDef, config[key])
        return error ? [error] : []
      },
    )

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  private validateConfigField(
    key: string,
    prop: unknown,
    value: unknown,
  ): string | null {
    const schemaProp =
      typeof prop === 'object' && prop !== null
        ? (prop as { required?: boolean; type?: string })
        : {}

    if (schemaProp.required && value === undefined) {
      return `Missing required field: ${key}`
    }

    if (value === undefined) {
      return null
    }

    const expectedType = schemaProp.type
    if (
      expectedType === 'string' &&
      typeof value !== 'string'
    ) {
      return `Field ${key} must be string`
    }
    if (
      expectedType === 'number' &&
      typeof value !== 'number'
    ) {
      return `Field ${key} must be number`
    }
    if (
      expectedType === 'boolean' &&
      typeof value !== 'boolean'
    ) {
      return `Field ${key} must be boolean`
    }

    return null
  }
}
