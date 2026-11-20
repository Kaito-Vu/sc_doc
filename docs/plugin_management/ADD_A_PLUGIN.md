# Adding a plugin (checklist)

All code lives under `ee/` (see CLAUDE.md golden rule).

## Server (`apps/server/src/ee/`)
1. `plugins/<id>/plugin.config.json` — `id`, `name`, `version`, `description`, `configLocation` (`plugin` = generic Plugins page, `security` = own settings block). Optional `plugin-config.schema.json` for config fields. Both files are picked up by the registry and copied to `dist` by `nest-cli.json`.
2. Code in `ee/<feature>/` as a normal Nest module; add it to `ee/plugins/plugin-modules.ts` (one import + one array entry).
3. Gate: `await isPluginEnabled(workspaceId, '<id>')` from `ee/plugins/plugin-enabled.ts`. In DI code you may call `PluginConfigService.getConfig(...)` directly. Default is off; results are cached ~5s.
4. Need to react to a core event? Register in `onModuleInit` with `HookRegistry.on(CoreHooks.X, ...)`. Check `enabled` inside the handler.

## Client (`apps/client/src/ee/`)
1. UI in `ee/<feature>/`.
2. Gate: `const enabled = usePluginEnabled('<id>')` from `ee/plugins/use-plugin-enabled.ts`.
3. Core gets only an import + one JSX line (see `page-header-menu.tsx`).

3. Settings form with config: `const { available, loading, saving, enabled, setEnabled, config, save } = usePluginConfig(id)` from `ee/plugins/use-plugin-config.ts`; copy `config` into local state, call `save({...})`. See `ip-allowlist-settings.tsx`.

## Install = admin toggle
New plugins appear in Settings > Plugins after rebuild/restart; admins switch them on per workspace.
