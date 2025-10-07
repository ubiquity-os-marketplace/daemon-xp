import { ContextPlugin } from "./context";

export function isIssueUnassignedEvent(context: ContextPlugin): context is ContextPlugin<"issues.unassigned"> {
  return context.eventName === "issues.unassigned";
}

export function isXpCommandEvent(
  context: ContextPlugin
): context is ContextPlugin<"issue_comment.created"> | ContextPlugin<"pull_request_review_comment.created"> | ContextPlugin<"pull_request_review.submitted"> {
  return (
    context.eventName === "issue_comment.created" ||
    context.eventName === "pull_request_review_comment.created" ||
    context.eventName === "pull_request_review.submitted"
  );
}
