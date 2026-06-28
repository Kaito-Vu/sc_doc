import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common'
import { InjectKysely } from 'nestjs-kysely'
import { Kysely } from 'kysely'
import { PluginRegistry } from './plugin.registry'

@Injectable()
export class PluginDefinitionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginDefinitionService.name)

  constructor(
    @InjectKysely() private readonly db: Kysely<any>,
    private readonly registry: PluginRegistry,
  ) {}

  async onApplicationBootstrap() {
    // Sync discovered plugins to database after app is ready
    await this.syncPluginDefinitions()
  }

  async syncPluginDefinitions(): Promise<void> {
    try {
      const plugins = this.registry.getAllPlugins()

      for (const plugin of plugins) {
        // Check if plugin definition exists
        const existing = await this.db
          .selectFrom('plugin_definitions')
          .select('id')
          .where('id', '=', plugin.id)
          .executeTakeFirst()

        if (existing) {
          // Update existing
          await this.db
            .updateTable('plugin_definitions')
            .set({
              name: plugin.name,
              version: plugin.version,
              description: plugin.description,
              author: plugin.author,
              config_schema: plugin.configSchema ? JSON.stringify(plugin.configSchema) : null,
              hooks: plugin.hooks || [],
              updated_at: new Date(),
            })
            .where('id', '=', plugin.id)
            .execute()

          this.logger.log(`Updated plugin definition: ${plugin.id}`)
        } else {
          // Insert new
          await this.db
            .insertInto('plugin_definitions')
            .values({
              id: plugin.id,
              name: plugin.name,
              version: plugin.version,
              description: plugin.description,
              author: plugin.author,
              config_schema: plugin.configSchema ? JSON.stringify(plugin.configSchema) : null,
              hooks: plugin.hooks || [],
            })
            .execute()

          this.logger.log(`Registered plugin definition: ${plugin.id}`)
        }
      }
    } catch (error) {
      this.logger.error('Failed to sync plugin definitions', error instanceof Error ? error.message : 'Unknown error')
    }
  }

  async getPluginDefinition(pluginId: string): Promise<any> {
    return this.db
      .selectFrom('plugin_definitions')
      .selectAll()
      .where('id', '=', pluginId)
      .executeTakeFirst()
  }

  async getAllDefinitions(): Promise<any[]> {
    return this.db.selectFrom('plugin_definitions').selectAll().execute()
  }
}
