import { StaticDecode, Type as T } from "@sinclair/typebox";

export const pluginSettingsSchema = T.Object(
  {
    disableCommentPosting: T.Boolean({
      description: "Set to true to prevent XP updates from being posted back to GitHub.",
      default: false,
    }),
    disqualificationBanThreshold: T.Number({
      description: "Ban the user from the organization when their XP falls below this value after a disqualification.",
      default: -2000,
    }),
  },
  { default: {} }
);

export type PluginSettings = StaticDecode<typeof pluginSettingsSchema>;
