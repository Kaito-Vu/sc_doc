import type { ComponentType } from "react";
import { IconPuzzle, IconShieldCheck } from "@tabler/icons-react";
import RecaptchaSettings from "@/ee/security/components/recaptcha-settings.tsx";

type PluginUi = {
  icon: typeof IconPuzzle;
  // Rendered on the Security settings page (the component hides itself when disabled).
  SettingsComponent?: ComponentType;
};

export const PLUGIN_UI: Record<string, PluginUi> = {
  recaptcha: { icon: IconShieldCheck, SettingsComponent: RecaptchaSettings },
};

export const DEFAULT_PLUGIN_ICON = IconPuzzle;
