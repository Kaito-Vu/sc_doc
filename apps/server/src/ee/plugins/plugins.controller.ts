import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  UseGuards,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { AuthUser } from '../../common/decorators/auth-user.decorator'
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator'
import { User, Workspace } from '@docmost/db/types/entity.types'
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory'
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type'
import {
  PluginConfigService,
  REDACTED_PLACEHOLDER,
} from './services/plugin-config.service'
import { PluginRegistry } from './services/plugin.registry'

// Field names always treated as secrets, on top of schema `isSecret` props.
const SECRET_FIELD_NAMES = [
  'secretKey',
  'secret',
  'password',
  'apiKey',
  'token',
  'key',
]

@Controller('plugins')
export class PluginsController {
  private readonly logger = new Logger(PluginsController.name)

  constructor(
    private readonly configService: PluginConfigService,
    private readonly registry: PluginRegistry,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  // Public (unauthenticated) endpoint: the login/signup pages need the
  // reCAPTCHA site key and per-action enablement before a session exists.
  // Must be declared before ':pluginId/config' so the static "recaptcha"
  // segment isn't swallowed by that param route. Never returns secretKey.
  @Get('recaptcha/config')
  async getRecaptchaPublicConfig(@AuthWorkspace() workspace: Workspace) {
    const config = await this.configService.getConfig(
      workspace.id,
      'recaptcha',
    )

    return {
      enabled: Boolean(config.enabled),
      config: {
        siteKey: config.config?.siteKey,
        actions: config.config?.actions,
      },
    }
  }

  // Readable by every member: feature UIs (e.g. page lock) need to know
  // whether a plugin is enabled. Contains no config values.
  @UseGuards(JwtAuthGuard)
  @Get()
  async listPlugins(@AuthWorkspace() workspace: Workspace) {
    const plugins = this.registry.getAllPlugins()
    const configs = await this.configService.listConfigs(workspace.id)
    const configMap = new Map(configs.map((c) => [c.pluginId, c]))

    return plugins.map((plugin) => {
      const config = configMap.get(plugin.id)
      return {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        description: plugin.description || '',
        author: plugin.author || 'Unknown',
        enabled: Boolean(config?.enabled),
        configured: this.configService.isConfigured(
          plugin.configSchema,
          config?.config || {},
        ),
        hooks: plugin.hooks || [],
        configSchema: plugin.configSchema,
        configRequired: plugin.configRequired,
        configLocation: plugin.configLocation,
      }
    })
  }

  @UseGuards(JwtAuthGuard)
  @Get(':pluginId')
  async getPlugin(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Param('pluginId') pluginId: string,
  ) {
    this.assertAdmin(user, workspace)
    const plugin = this.registry.getPlugin(pluginId)
    if (!plugin) {
      throw new NotFoundException(`Plugin ${pluginId} not found`)
    }

    const config = await this.configService.getConfig(workspace.id, pluginId)

    return {
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
      description: plugin.description,
      author: plugin.author,
      configSchema: plugin.configSchema,
      hooks: plugin.hooks,
      ...this.redactSecrets(config, plugin.configSchema),
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get(':pluginId/config')
  async getConfig(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Param('pluginId') pluginId: string,
  ) {
    this.assertAdmin(user, workspace)
    const config = await this.configService.getConfig(workspace.id, pluginId)
    return this.redactSecrets(config, this.registry.getPlugin(pluginId)?.configSchema)
  }

  @UseGuards(JwtAuthGuard)
  @Put(':pluginId/config')
  async updateConfig(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Param('pluginId') pluginId: string,
    @Body() body: { config?: Record<string, any>; enabled?: boolean },
  ) {
    this.assertAdmin(user, workspace)
    if (!body.config && body.enabled === undefined) {
      throw new BadRequestException('Must provide config or enabled field')
    }
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      throw new BadRequestException('enabled must be a boolean')
    }
    if (
      body.config !== undefined &&
      (typeof body.config !== 'object' ||
        body.config === null ||
        Array.isArray(body.config))
    ) {
      throw new BadRequestException('config must be an object')
    }

    const updated = await this.configService.updateConfig(
      workspace.id,
      pluginId,
      { config: body.config, enabled: body.enabled },
      user.id,
    )

    this.logger.log(
      `Plugin ${pluginId} config updated by user ${user.id} in workspace ${workspace.id}`,
    )

    return this.redactSecrets(updated, this.registry.getPlugin(pluginId)?.configSchema)
  }

  @UseGuards(JwtAuthGuard)
  @Post(':pluginId/toggle')
  async togglePlugin(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Param('pluginId') pluginId: string,
    @Body() body: { enabled: boolean },
  ) {
    this.assertAdmin(user, workspace)
    if (typeof body.enabled !== 'boolean') {
      throw new BadRequestException('enabled field is required')
    }

    const updated = await this.configService.togglePlugin(
      workspace.id,
      pluginId,
      body.enabled,
      user.id,
    )
    this.logger.log(
      `Plugin ${pluginId} ${updated.enabled ? 'enabled' : 'disabled'} by user ${user.id} in workspace ${workspace.id}`,
    )

    return { success: true, enabled: updated.enabled }
  }

  // Plugin settings (and their secrets) are workspace-admin only: a member
  // toggling reCAPTCHA off or reading its secret key is a privilege escalation.
  private assertAdmin(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace)
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException()
    }
  }

  private redactSecrets<T extends { config?: Record<string, any> }>(
    data: T,
    configSchema?: Record<string, any>,
  ): T {
    if (!data?.config) return data

    const schemaSecrets = Object.entries(configSchema?.properties ?? {})
      .filter(([, prop]) => (prop as { isSecret?: boolean })?.isSecret)
      .map(([name]) => name)

    const config = { ...data.config }
    for (const field of [...SECRET_FIELD_NAMES, ...schemaSecrets]) {
      if (config[field]) {
        config[field] = REDACTED_PLACEHOLDER
      }
    }

    return { ...data, config }
  }
}
