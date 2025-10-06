import { findLatestUnassignmentEvent } from "../github/find-latest-unassignment-event";
import { getIssueTimeline } from "../github/get-issue-timeline";
import { isBotActor } from "../github/is-bot-actor";
import { ContextPlugin } from "../types";

export async function handleIssueUnassigned(context: ContextPlugin<"issues.unassigned">): Promise<void> {
  const assignee = context.payload.assignee;
  if (!assignee) {
    context.logger.info("No assignee provided for unassigned event. Skipping XP processing.");
    return;
  }
  const timeline = await getIssueTimeline(context);
  const timelineEvent = findLatestUnassignmentEvent(timeline, assignee.id);
  if (!timelineEvent) {
    context.logger.info(`No unassignment timeline events found for userId ${assignee.id}.`);
    return;
  }
  const actor = "actor" in timelineEvent ? timelineEvent.actor : undefined;
  if (!isBotActor(actor as { type?: string | null; login?: string | null })) {
    context.logger.info("Unassignment was not performed by a bot. Skipping XP deduction.");
    return;
  }
  const issueId = Number(context.payload.issue.id ?? context.payload.issue.number);
  if (!Number.isFinite(issueId)) {
    throw context.logger.error("Issue ID missing from payload. Cannot persist XP entry.");
  }
  const issueUrl = context.payload.issue.html_url || context.payload.issue.url;
  if (!issueUrl) {
    throw context.logger.error("Issue URL missing from payload. Cannot persist XP entry.");
  }
  const labelNames = (context.payload.issue.labels ?? []).reduce<string[]>((names, label) => {
    if (typeof label === "string") {
      names.push(label);
      return names;
    }
    if (label && typeof label.name === "string") {
      names.push(label.name);
    }
    return names;
  }, []);
  const priceLabel = labelNames.find((name) => name.startsWith("Price:"));
  if (!priceLabel) {
    context.logger.info("No price label found on issue. Skipping XP deduction.");
    return;
  }
  const match = /Price:\s*(\d+(?:\.\d+)?)/i.exec(priceLabel);
  if (!match) {
    context.logger.info("Price label did not contain a numeric value. Skipping XP deduction.");
    return;
  }
  const xpAmount = Number.parseFloat(match[1]);
  if (!Number.isFinite(xpAmount)) {
    context.logger.info("Parsed price is not a finite number. Skipping XP deduction.");
    return;
  }
  await context.adapters.supabase.xp.saveRecord({
    userId: assignee.id,
    issue: {
      issueId,
      issueUrl,
    },
    numericAmount: -xpAmount,
  });
}
