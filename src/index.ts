import { SupabaseClient } from "@supabase/supabase-js";
import { Context } from "@ubiquity-os/plugin-sdk";
import { createAdapters } from "./adapters";
import { Database } from "./adapters/supabase/generated-types";
import { ContextPlugin, Env, PluginSettings, SupportedEvents } from "./types/index";
import { isIssueUnassignedEvent } from "./types/typeguards";

/**
 * The main plugin function. Split for easier testing.
 */
export async function runPlugin(context: Context<PluginSettings, Env, null, SupportedEvents>) {
  const { logger, eventName } = context;
  const supabaseClient = new SupabaseClient<Database>(context.env.SUPABASE_URL, context.env.SUPABASE_KEY);

  const augmentedContext = {
    ...context,
    adapters: createAdapters(supabaseClient, context as ContextPlugin),
  } as ContextPlugin;

  if (isIssueUnassignedEvent(augmentedContext)) {
    logger.info("Issue unassigned");
    return;
  }

  logger.warn(`Unsupported event: ${eventName}`);
}
