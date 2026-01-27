import { ContextPlugin } from "../types/index";
import { isXpCommandEvent } from "../types/typeguards";
import { handleXpCommand } from "./handle-xp-command";

export async function handleCommand(context: ContextPlugin) {
  if (!isXpCommandEvent(context)) {
    context.logger.debug("Received unsupported event for command handling, won't proceed with the LLM command.");
    return;
  }
  if (!context.command) {
    context.logger.debug("Received command without content, won't proceed with the LLM command.");
    return;
  }
  if (context.command.name === "xp") {
    return handleXpCommand(context);
  } else {
    context.logger.warn(`Received unknown command: ${context.command.name}`);
  }
}
