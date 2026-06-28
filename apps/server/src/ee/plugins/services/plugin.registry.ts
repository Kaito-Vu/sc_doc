import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'fs'
import * as path from 'path'

export interface PluginMetadata {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  configSchema?: Record<string, any>
  hooks?: string[]
  configRequired?: boolean
}

@Injectable()
export class PluginRegistry {
  private readonly logger = new Logger(PluginRegistry.name)
  private plugins: Map<string, PluginMetadata> = new Map()

  constructor() {
    this.loadPlugins()
  }

  private loadPlugins(): void {
    // Scan multiple plugin directories
    const pluginDirs = [
      path.join(process.cwd(), 'plugins'), // External plugins
      path.join(__dirname, '..'), // Built-in plugins (same level as this registry)
    ]

    for (const pluginsDir of pluginDirs) {
      if (!fs.existsSync(pluginsDir)) {
        this.logger.debug(`Plugins directory not found: ${pluginsDir}`)
        continue
      }

      try {
        const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })

        for (const entry of entries) {
          if (!entry.isDirectory()) continue

          const configPath = path.join(pluginsDir, entry.name, 'plugin.config.json')
          if (!fs.existsSync(configPath)) continue

          try {
            const configContent = fs.readFileSync(configPath, 'utf-8')
            const config: PluginMetadata = JSON.parse(configContent)

            // Validate config
            if (!config.id || !config.name || !config.version) {
              this.logger.warn(
                `Invalid plugin config in ${entry.name}: missing required fields`,
              )
              continue
            }

            // Load schema if available
            const schemaPath = path.join(pluginsDir, entry.name, 'plugin-config.schema.json')
            if (fs.existsSync(schemaPath)) {
              try {
                const schemaContent = fs.readFileSync(schemaPath, 'utf-8')
                config.configSchema = JSON.parse(schemaContent)
              } catch (schemaError) {
                this.logger.warn(`Failed to load schema for plugin ${config.id}:`, schemaError)
              }
            }

            this.plugins.set(config.id, config)
            this.logger.log(`Plugin loaded: ${config.id} v${config.version} from ${pluginsDir}`)
          } catch (error) {
            this.logger.error(
              `Failed to parse plugin config from ${configPath}:`,
              error,
            )
          }
        }
      } catch (error) {
        this.logger.error(`Failed to load plugins directory ${pluginsDir}:`, error)
      }
    }
  }

  getPlugin(id: string): PluginMetadata | undefined {
    return this.plugins.get(id)
  }

  getAllPlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values())
  }

  hasPlugin(id: string): boolean {
    return this.plugins.has(id)
  }

  reloadPlugins(): void {
    this.plugins.clear()
    this.loadPlugins()
  }
}
