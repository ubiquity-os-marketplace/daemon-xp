import { isBotActor } from "../github/is-bot-actor";
import { ContextPlugin, UserXpTotal } from "../types/index";
import { isIssueCommentCreatedEvent, isPullRequestReviewCommentCreatedEvent, isPullRequestReviewSubmittedEvent } from "../types/typeguards";
import { formatHandle, formatXp, sanitizeHandle, shouldReturnNoData } from "../xp/utils";

const XP_COMMAND = "/xp";

type ParsedCommand = {
  username?: string;
};

type Sender = {
  login?: string | null;
  id?: number | null;
  type?: string | null;
};

type TargetUser = {
  login: string;
  id: number;
};

export async function handleXpCommand(context: ContextPlugin): Promise<void> {
  const commentBody = getCommentBody(context);
  if (!commentBody) {
    context.logger.debug("No comment body found for XP command event.");
    return;
  }
  let parsed = parseCommand(commentBody);
  // If the reason of invocation is a command from an LLM, use the sender's identity
  if (context.command) {
    parsed = { username: context.command.parameters.username ?? context.payload.sender.login };
  } else if (!parsed) {
    context.logger.debug("Invalid XP command format.", { commentBody });
    return;
  }
  const sender = getSender(context);
  if (!sender || !sender.login || typeof sender.id !== "number") {
    throw context.logger.warn("Sender information missing for XP command event.");
  }
  if (isBotActor({ login: sender.login, type: sender.type })) {
    context.logger.debug("Ignoring XP command from bot sender.");
    return;
  }
  const target = await resolveTargetUser(context, sender, parsed);
  if (!target) {
    await context.commentHandler.postComment(context, context.logger.warn(`I don't have XP data for ${formatHandle(parsed.username ?? sender.login)} yet.`));
    return;
  }
  const scopeIds = resolveScopeIds(context);
  const total = await context.adapters.supabase.xp.getUserTotal(target.id, scopeIds);
  if (shouldReturnNoData(total)) {
    await context.commentHandler.postComment(context, context.logger.warn(`I don't have XP data for ${formatHandle(target.login)} yet.`));
    return;
  }
  const body = buildXpCommentBody(target.login, total);
  await context.commentHandler.postComment(context, context.logger.ok(body));
}

function getCommentBody(context: ContextPlugin): string | null {
  if (isPullRequestReviewSubmittedEvent(context)) {
    return context.payload.review.body;
  }
  if (isIssueCommentCreatedEvent(context) || isPullRequestReviewCommentCreatedEvent(context)) {
    return context.payload.comment.body;
  }
  return null;
}

function parseCommand(body: string): ParsedCommand | null {
  const trimmed = body.trim();
  if (!trimmed.toLowerCase().startsWith(XP_COMMAND)) {
    return null;
  }
  const parts = trimmed.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length === 0 || parts[0].toLowerCase() !== XP_COMMAND) {
    return null;
  }
  if (parts.length === 1) {
    return {};
  }
  const username = sanitizeHandle(parts[1]);
  if (!username) {
    return {};
  }
  return { username };
}

function getSender(context: ContextPlugin): Sender | undefined {
  return (context.payload as { sender?: Sender } | undefined)?.sender;
}

async function resolveTargetUser(context: ContextPlugin, sender: Sender, parsed: ParsedCommand): Promise<TargetUser | undefined> {
  if (!parsed.username) {
    if (typeof sender.id !== "number" || typeof sender.login !== "string") {
      return undefined;
    }
    return {
      id: sender.id,
      login: sender.login,
    };
  }
  try {
    const response = await context.octokit.rest.users.getByUsername({ username: parsed.username });
    return {
      id: response.data.id,
      login: response.data.login,
    };
  } catch (err) {
    if (isNotFoundError(err)) {
      context.logger.warn(`User ${parsed.username} not found on GitHub.`);
      return undefined;
    }
    throw context.logger.error(`Failed to fetch user information from GitHub for ${parsed.username}`, {
      err,
      username: parsed.username,
    });
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const status = (error as { status?: number }).status;
  return status === 404;
}

export function buildXpCommentBody(login: string, totals: UserXpTotal): string {
  const handle = formatHandle(login);
  if (!totals.scopes) {
    const formattedXp = formatXp(totals.total);
    return `${handle} currently has ${formattedXp} XP.`;
  }
  const repoValue = formatScopeValue(totals.scopes.repo);
  const orgValue = formatScopeValue(totals.scopes.org);
  const globalValue = formatScopeValue(totals.scopes.global ?? totals.total);
  const lines = [`### ${handle} XP`, "", `${toCode(repoValue)} repo / ${toCode(orgValue)} org / ${toCode(globalValue)} global`];
  return lines.join("\n");
}

function resolveScopeIds(context: ContextPlugin): { repositoryId?: number; organizationId?: number } {
  const repositoryId = toFiniteNumber(context.payload.repository?.id);
  const organizationId = toFiniteNumber(context.payload.organization?.id) ?? toFiniteNumber(context.payload.repository?.owner?.id);
  return { repositoryId, organizationId };
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function formatScopeValue(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return formatXp(value);
}

function toCode(value: string): string {
  return `\`${value}\``;
}
