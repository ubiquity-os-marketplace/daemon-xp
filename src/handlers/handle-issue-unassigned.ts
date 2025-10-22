import { filterCollaborators } from "../github/filter-collaborators";
import { findLatestDisqualifierComment } from "../github/find-latest-disqualifier-comment";
import { findLatestUnassignmentEvent } from "../github/find-latest-unassignment-event";
import { getInvolvedUsers } from "../github/get-involved-users";
import { getIssueTimeline, IssueTimelineEvent } from "../github/get-issue-timeline";
import { isBotActor } from "../github/is-bot-actor";
import { ContextPlugin } from "../types/index";
import { formatXp, sanitizeHandle } from "../xp/utils";

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
  if (!isActorLike(actor) || !isBotActor(actor)) {
    context.logger.info("Unassignment was not performed by a bot. Skipping XP deduction.");
    return;
  }
  const unassignmentDate = extractCreatedAt(timelineEvent);
  if (!unassignmentDate) {
    context.logger.info("Unassignment event did not contain a valid timestamp. Skipping XP deduction.");
    return;
  }
  const disqualifierComment = findLatestDisqualifierComment(timeline, unassignmentDate);
  if (!disqualifierComment) {
    context.logger.info("No disqualification marker found near unassignment. Skipping XP deduction.");
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
  const { multiplier, collaborators } = await resolveCollaboratorMultiplier(context);
  const malusAmount = xpAmount * multiplier;
  await context.adapters.supabase.xp.saveRecord({
    userId: assignee.id,
    issue: {
      issueId,
      issueUrl,
    },
    numericAmount: -malusAmount,
  });
  const currentTotal = await context.adapters.supabase.xp.getUserTotal(assignee.id);
  const totalAfterMalus = currentTotal.total - malusAmount;
  if (
    await maybeBanAssignee(context, {
      assignee,
      totalAfterMalus,
    })
  ) {
    // Do not post malus XP as the user got banned anyway
    return;
  }
  if (context.config?.disableCommentPosting) {
    context.logger.info("Comment posting disabled via configuration.");
    return;
  }
  await postMalusComment(context, {
    assignee,
    malusAmount,
    multiplier,
    collaborators,
    currentTotal: totalAfterMalus,
    issueUrl,
  });
}

type CollaboratorMultiplierResult = {
  multiplier: number;
  collaborators: Awaited<ReturnType<typeof filterCollaborators>>;
};

async function resolveCollaboratorMultiplier(context: ContextPlugin<"issues.unassigned">): Promise<CollaboratorMultiplierResult> {
  const users = await getInvolvedUsers(context);
  if (users.length === 0) {
    context.logger.info("No involved users detected for disqualification event.");
    return {
      multiplier: 1,
      collaborators: [],
    };
  }
  const collaborators = await filterCollaborators(context, users);
  const count = collaborators.length;
  if (count === 0) {
    context.logger.info("No collaborators among involved users. Applying base malus only.");
    return {
      multiplier: 1,
      collaborators,
    };
  }
  context.logger.info(`Found ${count} collaborators involved. Applying multiplier.`);
  return {
    multiplier: count,
    collaborators,
  };
}

type MalusCommentDetails = {
  assignee: NonNullable<ContextPlugin<"issues.unassigned">["payload"]["assignee"]>;
  malusAmount: number;
  multiplier: number;
  collaborators: Awaited<ReturnType<typeof filterCollaborators>>;
  currentTotal: number;
  issueUrl: string;
};

type BanDetails = {
  assignee: NonNullable<ContextPlugin<"issues.unassigned">["payload"]["assignee"]>;
  totalAfterMalus: number;
};

async function maybeBanAssignee(context: ContextPlugin<"issues.unassigned">, details: BanDetails): Promise<boolean> {
  const threshold = context.config?.disqualificationBanThreshold;
  const assigneeLogin = details.assignee.login;

  if (details.totalAfterMalus >= threshold) {
    context.logger.info(`XP total (${details.totalAfterMalus}) is above threshold (${threshold}). Skipping ban for ${assigneeLogin}.`);
    return false;
  }
  const orgLogin = context.payload.organization?.login;
  if (typeof orgLogin !== "string" || orgLogin.trim().length === 0) {
    throw context.logger.error("Organization login missing from payload. Cannot ban user.");
  }
  const banMessage = context.logger.warn(
    `XP total fell below threshold (${details.totalAfterMalus} < ${threshold}). Banning \`${assigneeLogin}\` from \`${orgLogin}\`.`
  );
  if (!context.config.disableCommentPosting) {
    await context.commentHandler.postComment(context, banMessage);
  }
  try {
    await context.octokit.rest.orgs.blockUser({
      org: orgLogin,
      username: assigneeLogin,
    });
    context.logger.info(`Successfully banned ${assigneeLogin} from ${orgLogin}.`);
    return true;
  } catch (err) {
    throw context.logger.error(`Failed to ban ${assigneeLogin} from ${orgLogin}.`, { err });
  }
}

async function postMalusComment(context: ContextPlugin<"issues.unassigned">, details: MalusCommentDetails): Promise<void> {
  const assigneeHandle = getDisplayHandle(details.assignee.login, details.assignee.id);
  const collaboratorHandles = details.collaborators.map((item) => toCode(getDisplayHandle(item.login, item.id)));
  const formattedMalus = formatXp(details.malusAmount);
  const formattedTotal = formatXp(details.currentTotal);
  const collaboratorText = collaboratorHandles.length > 0 ? collaboratorHandles.join(", ") : toCode("None");
  const assigneeCode = toCode(assigneeHandle);
  const multiplierValue = toCode(String(details.multiplier) + "x");
  const malusValue = toCode("-" + formattedMalus + " XP");
  const totalValue = toCode(formattedTotal + " XP");
  const lines = [
    "### XP Malus Applied",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Assignee | ${assigneeCode} |`,
    `| Collaborator Multiplier | ${multiplierValue} |`,
    `| Collaborators | ${collaboratorText} |`,
    `| Applied Malus | ${malusValue} |`,
    `| Current XP | ${totalValue} |`,
  ];
  const body = lines.join("\n");
  await context.commentHandler.postComment(context, context.logger.info(body));
}

function isActorLike(actor: unknown): actor is { login?: string | null; type?: string | null } {
  if (!actor || typeof actor !== "object") {
    return false;
  }
  const candidate = actor as { login?: unknown; type?: unknown };
  const hasLogin = typeof candidate.login === "string";
  const hasType = typeof candidate.type === "string";
  return hasLogin || hasType;
}

function extractCreatedAt(event: IssueTimelineEvent): Date | null {
  if (!("created_at" in event)) {
    return null;
  }
  const value = (event as { created_at?: string | null }).created_at;
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date;
}

function getDisplayHandle(login: unknown, fallback: unknown): string {
  if (typeof login === "string") {
    const sanitized = sanitizeHandle(login);
    if (sanitized) {
      return sanitized;
    }
  }
  return String(fallback);
}

function toCode(value: string): string {
  return `\`${value}\``;
}
