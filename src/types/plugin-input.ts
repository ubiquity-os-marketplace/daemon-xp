import { StaticDecode, Type as T } from "@sinclair/typebox";

export const pluginSettingsSchema = T.Object({}, { default: {} });

export type PluginSettings = StaticDecode<typeof pluginSettingsSchema>;
