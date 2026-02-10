import { StaticDecode, Type as T } from "@sinclair/typebox";

export const xpCommandSchema = T.Object({
  name: T.Literal("xp", {
    description: "Gets the XP for a user. If no user is specified, the user who invoked the command will be used.",
    examples: ["/xp @username"],
  }),
  parameters: T.Object({
    username: T.Optional(T.String({ description: "GitHub username to get XP for.", examples: ["@UbiquityOS"] })),
  }),
});

export type Command = StaticDecode<typeof xpCommandSchema>;
