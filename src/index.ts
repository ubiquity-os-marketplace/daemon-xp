import { createClient } from "@supabase/supabase-js";
import { Context } from "@ubiquity-os/plugin-sdk";
import { createAdapters } from "./adapters";
import { Database } from "./adapters/supabase/generated-types";
import { handleIssueUnassigned } from "./handlers/handle-issue-unassigned";
import { handleXpCommand } from "./handlers/handle-xp-command";
import { ContextPlugin, Env, PluginSettings, SupportedEvents } from "./types/index";
import { isIssueUnassignedEvent, isXpCommandEvent } from "./types/typeguards";

/**
 * The main plugin function. Split for easier testing.
 */
export async function runPlugin(context: Context<PluginSettings, Env, null, SupportedEvents>) {
  const { logger, eventName } = context;
  const augmentedContext = context as ContextPlugin;

  if (!augmentedContext.adapters) {
    const supabaseClient = createClient<Database>(context.env.SUPABASE_URL, context.env.SUPABASE_KEY);
    augmentedContext.adapters = createAdapters(supabaseClient, augmentedContext);
  }

  if (isXpCommandEvent(augmentedContext)) {
    await handleXpCommand(augmentedContext);
    return;
  }

  if (isIssueUnassignedEvent(augmentedContext)) {
    await handleIssueUnassigned(augmentedContext);
    return;
  }

  logger.warn(`Unsupported event: ${eventName}`);
}
