import { NumberingSettings } from "@docmost/editor-ext";

export interface IUpdateNumberingSettings {
  pageId: string;
  numberingSettings: NumberingSettings;
}

export interface IUpdateNumberingSettingsResponse {
  numberingSettings: NumberingSettings;
}
