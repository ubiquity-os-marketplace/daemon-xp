import { StaticDecode, Type as T } from "@sinclair/typebox";

export const xpCommandSchema = T.Object({
  name: T.Literal("xp"),
  parameters: T.Object({
    username: T.Optional(T.String()),
  }),
});

export type Command = StaticDecode<typeof xpCommandSchema>;
