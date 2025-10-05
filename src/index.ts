import { Context } from "@ubiquity-os/plugin-sdk";
import { ContextPlugin } from "./types/index";
import { isIssueUnassignedEvent } from "./types/typeguards";

/**
 * The main plugin function. Split for easier testing.
 */
export async function runPlugin(context: Context) {
  const { logger, eventName } = context;
  const augmentedContext = {
    ...context,
    adapters: {},
  } as ContextPlugin;

  if (isIssueUnassignedEvent(augmentedContext)) {
    logger.info("Issue unassigned");
    return;
  }

  logger.warn(`Unsupported event: ${eventName}`);
}
