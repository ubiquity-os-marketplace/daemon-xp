import { Value } from "@sinclair/typebox/value";
import { createPlugin } from "@ubiquity-os/plugin-sdk";
import { Manifest } from "@ubiquity-os/plugin-sdk/manifest";
import { LOG_LEVEL, LogLevel } from "@ubiquity-os/ubiquity-os-logger";
import { ExecutionContext } from "hono";
import { env as honoEnv } from "hono/adapter";
import manifest from "../manifest.json";
import { handleXpRequest } from "./http/xp/handle-xp-request";
import { runPlugin } from "./index";
import { Env, envSchema, PluginSettings, pluginSettingsSchema, SupportedEvents } from "./types/index";

export default {
  async fetch(request: Request, env: Env, executionCtx?: ExecutionContext) {
    const plugin = createPlugin<PluginSettings, Env, null, SupportedEvents>(
      (context) => {
        return runPlugin(context);
      },
      manifest as Manifest,
      {
        envSchema: envSchema,
        postCommentOnError: true,
        settingsSchema: pluginSettingsSchema,
        logLevel: (env.LOG_LEVEL as LogLevel) || LOG_LEVEL.INFO,
        kernelPublicKey: env.KERNEL_PUBLIC_KEY,
        bypassSignatureVerification: process.env.NODE_ENV === "local",
      }
    );

    plugin.get("/xp", (ctx) => {
      let validatedEnv: Env;

      try {
        const runtimeEnv = honoEnv(ctx as unknown as Parameters<typeof honoEnv>[0]);
        validatedEnv = Value.Decode(envSchema, Value.Default(envSchema, runtimeEnv));
      } catch (error) {
        console.error("Invalid environment for /xp request", error);
        return ctx.json(
          {
            error: {
              code: "invalid_environment",
              message: "Environment variables are misconfigured.",
            },
          },
          500
        );
      }
      return handleXpRequest(ctx.req.raw, validatedEnv);
    });

    return plugin.fetch(request, env, executionCtx);
  },
};
