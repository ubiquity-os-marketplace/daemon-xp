import { Value } from "@sinclair/typebox/value";
import { createPlugin } from "@ubiquity-os/plugin-sdk";
import { Manifest, resolveRuntimeManifest } from "@ubiquity-os/plugin-sdk/manifest";
import { LOG_LEVEL, LogLevel } from "@ubiquity-os/ubiquity-os-logger";
import { ExecutionContext } from "hono";
import { env, env as honoEnv } from "hono/adapter";
import manifest from "../manifest.json" with { type: "json" };
import { handleXpRequest } from "./http/xp/handle-xp-request";
import { runPlugin } from "./index";
import { Command } from "./types/command";
import { Env, envSchema, PluginSettings, pluginSettingsSchema, SupportedEvents } from "./types/index";

function buildRuntimeManifest(request: Request) {
  const runtimeManifest = resolveRuntimeManifest(manifest as Manifest);

  return {
    ...runtimeManifest,
    homepage_url: new URL(request.url).origin,
  };
}

export default {
  async fetch(request: Request, serverInfo: Deno.ServeHandlerInfo, executionCtx?: ExecutionContext) {
    const runtimeManifest = buildRuntimeManifest(request);
    if (new URL(request.url).pathname === "/manifest.json") {
      return Response.json(runtimeManifest);
    }
    const environment = env<Env>(request as never);
    const plugin = createPlugin<PluginSettings, Env, Command, SupportedEvents>(
      (context) => {
        return runPlugin(context);
      },
      runtimeManifest as Manifest,
      {
        envSchema: envSchema,
        postCommentOnError: true,
        settingsSchema: pluginSettingsSchema,
        logLevel: (environment.LOG_LEVEL as LogLevel) || LOG_LEVEL.INFO,
        kernelPublicKey: environment.KERNEL_PUBLIC_KEY,
        bypassSignatureVerification: environment.NODE_ENV === "local",
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

    return plugin.fetch(request, serverInfo, executionCtx);
  },
};
