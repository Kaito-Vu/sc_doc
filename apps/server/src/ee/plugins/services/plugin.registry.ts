import { Injectable, Logger } from '@nestjs/common'
import * as fs from 'node:fs'
import * as path from 'node:path'

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
  private readonly plugins: Map<string, PluginMetadata> = new Map()

  constructor() {
    this.loadPlugins()
  }

  private loadPlugins(): void {
    const pluginDirs = [
      path.join(process.cwd(), 'plugins'),
      path.join(__dirname, '..'),
    ]

    for (const pluginsDir of pluginDirs) {
      this.loadPluginsFromDirectory(pluginsDir)
    }
  }

  private loadPluginsFromDirectory(pluginsDir: string): void {
    if (!fs.existsSync(pluginsDir)) {
      this.logger.debug(`Plugins directory not found: ${pluginsDir}`)
      return
    }

    try {
      const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue
        }

        this.loadPluginFromEntry(pluginsDir, entry.name)
      }
    } catch (error) {
      this.logger.error(`Failed to load plugins directory ${pluginsDir}:`, error)
    }
  }

  private loadPluginFromEntry(pluginsDir: string, entryName: string): void {
    const configPath = path.join(pluginsDir, entryName, 'plugin.config.json')
    if (!fs.existsSync(configPath)) {
      return
    }

    try {
      const configContent = fs.readFileSync(configPath, 'utf-8')
      const rawConfig = JSON.parse(configContent)
      const config = this.parsePluginMetadata(rawConfig, entryName)

      if (!config) {
        return
      }

      this.attachPluginSchema(pluginsDir, entryName, config)
      this.plugins.set(config.id, config)
      this.logger.log(
        `Plugin loaded: ${config.id} v${config.version} from ${pluginsDir}`,
      )
    } catch (error) {
      this.logger.error(
        `Failed to parse plugin config from ${configPath}:`,
        error,
      )
    }
  }

  private parsePluginMetadata(
    rawConfig: Record<string, unknown>,
    entryName: string,
  ): PluginMetadata | null {
    if (
      typeof rawConfig.id !== 'string' ||
      typeof rawConfig.name !== 'string' ||
      typeof rawConfig.version !== 'string' ||
      !rawConfig.id ||
      !rawConfig.name ||
      !rawConfig.version
    ) {
      this.logger.warn(
        `Invalid plugin config in ${entryName}: missing required fields`,
      )
      return null
    }

    return {
      id: rawConfig.id,
      name: rawConfig.name,
      version: rawConfig.version,
      description:
        typeof rawConfig.description === 'string'
          ? rawConfig.description
          : undefined,
      author:
        typeof rawConfig.author === 'string' ? rawConfig.author : undefined,
      hooks: Array.isArray(rawConfig.hooks)
        ? (rawConfig.hooks as string[])
        : undefined,
      configRequired:
        typeof rawConfig.configRequired === 'boolean'
          ? rawConfig.configRequired
          : undefined,
    }
  }

  private attachPluginSchema(
    pluginsDir: string,
    entryName: string,
    config: PluginMetadata,
  ): void {
    const schemaPath = path.join(
      pluginsDir,
      entryName,
      'plugin-config.schema.json',
    )

    if (!fs.existsSync(schemaPath)) {
      return
    }

    try {
      const schemaContent = fs.readFileSync(schemaPath, 'utf-8')
      config.configSchema = JSON.parse(schemaContent)
    } catch (schemaError) {
      this.logger.warn(
        `Failed to load schema for plugin ${config.id}:`,
        schemaError,
      )
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
