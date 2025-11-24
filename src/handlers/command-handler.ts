import { ContextPlugin } from "../types";
import { isIssueCommentCreatedEvent } from "../types/typeguards";
import { handleXpCommand } from "./handle-xp-command";

export async function handleCommand(context: ContextPlugin) {
  if (!isIssueCommentCreatedEvent(context)) {
    context.logger.warn("Received non-issue comment event, won't proceed with the LLM command.");
    return;
  }
  if (!context.command) {
    context.logger.warn("Received command without content, won't proceed with the LLM command.");
    return;
  }
  if (context.command.name === "xp") {
    return handleXpCommand(context);
  } else {
    context.logger.warn(`Received unknown command: ${context.command.name}`);
  }
}
