import { StaticDecode, Type as T } from "@sinclair/typebox";

export const pluginSettingsSchema = T.Object(
  {
    disableCommentPosting: T.Optional(
      T.Boolean({
        description: "Set to true to prevent XP updates from being posted back to GitHub.",
        default: false,
      })
    ),
  },
  { default: {} }
);

export type PluginSettings = StaticDecode<typeof pluginSettingsSchema>;
