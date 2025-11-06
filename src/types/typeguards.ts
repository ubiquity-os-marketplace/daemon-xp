import { ContextPlugin } from "./context";

export function isIssueUnassignedEvent(context: ContextPlugin): context is ContextPlugin<"issues.unassigned"> {
  return context.eventName === "issues.unassigned";
}

export function isIssueCommentCreatedEvent(context: ContextPlugin): context is ContextPlugin<"issue_comment.created"> {
  return context.eventName === "issue_comment.created";
}

export function isPullRequestReviewCommentCreatedEvent(context: ContextPlugin): context is ContextPlugin<"pull_request_review_comment.created"> {
  return context.eventName === "pull_request_review_comment.created";
}

export function isPullRequestReviewSubmittedEvent(context: ContextPlugin): context is ContextPlugin<"pull_request_review.submitted"> {
  return context.eventName === "pull_request_review.submitted";
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
