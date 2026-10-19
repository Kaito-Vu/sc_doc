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

// Placeholder returned to clients in place of secret values; never persist it.
export const REDACTED_PLACEHOLDER = '***REDACTED***'

function toConfigData(row: any): PluginConfigData {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    pluginId: row.pluginId,
    enabled: row.enabled,
    config: row.config || {},
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Overlays submitted values onto the stored config. Empty strings and the
 * redaction placeholder mean "unchanged": a client that sends back
 * "***REDACTED***" for an untouched secret field (e.g. an older cached
 * bundle) must not clobber the real stored secret with that literal.
 */
function mergeConfig(
  existing: Record<string, any>,
  updates: Record<string, any>,
): Record<string, any> {
  return {
    ...existing,
    ...Object.fromEntries(
      Object.entries(updates).filter(
        ([, value]) =>
          value !== undefined && value !== '' && value !== REDACTED_PLACEHOLDER,
      ),
    ),
  }
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

    return toConfigData(config)
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
    // Never log `updates`: it carries plaintext secrets (e.g. secretKey).
    const plugin = this.registry.getPlugin(pluginId)
    if (!plugin) {
      throw new NotFoundException(`Plugin ${pluginId} not found`)
    }

    const result = await this.upsertConfigWithRetry(
      workspaceId,
      pluginId,
      updates,
      userId,
      plugin.configSchema,
    )

    this.logger.log(
      `Plugin ${pluginId} config updated in workspace ${workspaceId}`,
    )

    return toConfigData(result)
  }

  /**
   * Validates the config as it will be stored (stored values overlaid with
   * the submitted ones), so a partial update that omits an already-stored
   * required secret is not rejected as "missing".
   */
  private assertValidConfig(
    config: Record<string, any>,
    schema: Record<string, any> | undefined,
  ): void {
    if (!schema) return
    const errors = this.validateObject(config, schema, '')
    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Invalid configuration',
        errors,
      })
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
    configSchema?: Record<string, any>,
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
        ? mergeConfig(existingConfig, updates.config)
        : existingConfig
      if (updates.config) this.assertValidConfig(nextConfig, configSchema)

      const result = await this.db
        .updateTable('plugin_configurations')
        .set({
          enabled: updates.enabled ?? existing.enabled,
          config: nextConfig,
          updated_at: new Date(),
          updated_by: userId || existing.updatedBy,
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
          configSchema,
          attempt + 1,
        )
      }

      return result
    }

    const initialConfig = mergeConfig({}, updates.config || {})
    if (updates.config) this.assertValidConfig(initialConfig, configSchema)

    try {
      return await this.db
        .insertInto('plugin_configurations')
        .values({
          workspace_id: workspaceId,
          plugin_id: pluginId,
          enabled: updates.enabled ?? false,
          config: initialConfig,
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
        configSchema,
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
    return this.updateConfig(workspaceId, pluginId, { enabled }, userId)
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

    return configs.map(toConfigData)
  }

  /**
   * Minimal JSON-schema subset used by plugin-config.schema.json files:
   * per-property `required`, `type` (string/number/boolean/object, objects
   * validated recursively), `minimum`/`maximum` and `enum`.
   */
  private validateObject(
    value: Record<string, any>,
    schema: Record<string, any>,
    prefix: string,
  ): string[] {
    if (!schema.properties) return []
    return Object.entries(schema.properties).flatMap(([key, propDef]) =>
      this.validateConfigField(`${prefix}${key}`, propDef, value?.[key]),
    )
  }

  private validateConfigField(
    key: string,
    prop: unknown,
    value: unknown,
  ): string[] {
    const schemaProp =
      typeof prop === 'object' && prop !== null
        ? (prop as {
            required?: boolean
            type?: string
            minimum?: number
            maximum?: number
            enum?: unknown[]
            properties?: Record<string, unknown>
          })
        : {}

    if (value === undefined) {
      return schemaProp.required ? [`Missing required field: ${key}`] : []
    }

    switch (schemaProp.type) {
      case 'string':
        if (typeof value !== 'string') return [`Field ${key} must be string`]
        break
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          return [`Field ${key} must be number`]
        }
        if (schemaProp.minimum !== undefined && value < schemaProp.minimum) {
          return [`Field ${key} must be >= ${schemaProp.minimum}`]
        }
        if (schemaProp.maximum !== undefined && value > schemaProp.maximum) {
          return [`Field ${key} must be <= ${schemaProp.maximum}`]
        }
        break
      case 'boolean':
        if (typeof value !== 'boolean') return [`Field ${key} must be boolean`]
        break
      case 'object':
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return [`Field ${key} must be object`]
        }
        return this.validateObject(
          value as Record<string, any>,
          schemaProp,
          `${key}.`,
        )
    }

    if (schemaProp.enum && !schemaProp.enum.includes(value)) {
      return [`Field ${key} must be one of: ${schemaProp.enum.join(', ')}`]
    }

    return []
  }
}
