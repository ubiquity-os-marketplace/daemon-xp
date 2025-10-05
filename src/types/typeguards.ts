import { ContextPlugin } from "./context";

/**
 * Typeguards are most helpful when you have a union type, and you want to narrow it down to a specific one.
 * In other words, if `SupportedEvents` has multiple types then these restrict the scope
 * of `context` to a specific event payload.
 */

/**
 * Restricts the scope of `context` to the `issue_comment.created` payload.
 */
export function isIssueUnassignedEvent(context: ContextPlugin): context is ContextPlugin {
  return context.eventName === "issues.unassigned";
}
