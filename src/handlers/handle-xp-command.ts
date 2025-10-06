import Decimal from "decimal.js";
import { isBotActor } from "../github/is-bot-actor";
import { ContextPlugin } from "../types";
import { UserXpTotal } from "../types/supabase";

const XP_COMMAND = "/xp";

type XpCommandContext =
  | ContextPlugin<"issue_comment.created">
  | ContextPlugin<"pull_request_review_comment.created">
  | ContextPlugin<"pull_request_review.submitted">;

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

export async function handleXpCommand(context: XpCommandContext): Promise<boolean> {
  const commentBody = getCommentBody(context);
  if (!commentBody) {
    return false;
  }
  const parsed = parseCommand(commentBody);
  if (!parsed) {
    return false;
  }
  const sender = getSender(context);
  if (!sender || !sender.login || typeof sender.id !== "number") {
    throw context.logger.error("Sender information missing for XP command event.");
  }
  if (isBotActor({ login: sender.login, type: sender.type })) {
    context.logger.info("Ignoring XP command from bot sender.");
    return false;
  }
  const target = await resolveTargetUser(context, sender, parsed);
  if (!target) {
    await postNoDataComment(context, parsed.username ?? sender.login);
    return true;
  }
  const total = await context.adapters.supabase.xp.getUserTotal(target.id);
  if (shouldReturnNoData(total)) {
    await postNoDataComment(context, target.login);
    return true;
  }
  const formattedXp = formatXp(total.total);
  await postComment(context, `${formatHandle(target.login)} currently has ${formattedXp} XP.`);
  return true;
}

function getCommentBody(context: XpCommandContext): string | undefined {
  if (context.eventName === "issue_comment.created") {
    const comment = (context.payload as { comment?: { body?: unknown } } | undefined)?.comment;
    return typeof comment?.body === "string" ? comment.body : undefined;
  }
  if (context.eventName === "pull_request_review_comment.created") {
    const comment = (context.payload as { comment?: { body?: unknown } } | undefined)?.comment;
    return typeof comment?.body === "string" ? comment.body : undefined;
  }
  if (context.eventName === "pull_request_review.submitted") {
    const review = (context.payload as { review?: { body?: unknown } } | undefined)?.review;
    return typeof review?.body === "string" ? review.body : undefined;
  }
  return undefined;
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

function sanitizeHandle(raw: string): string | undefined {
  const normalized = raw.trim().replace(/^@+/, "");
  if (normalized.length === 0) {
    return undefined;
  }
  return normalized;
}

function getSender(context: XpCommandContext): Sender | undefined {
  return (context.payload as { sender?: Sender } | undefined)?.sender;
}

async function resolveTargetUser(context: XpCommandContext, sender: Sender, parsed: ParsedCommand): Promise<TargetUser | undefined> {
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
      context.logger.info(`User ${parsed.username} not found on GitHub.`);
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

function shouldReturnNoData(total: UserXpTotal): boolean {
  return total.permitCount === 0 || !Number.isFinite(total.total);
}

function formatXp(amount: number): string {
  if (!Number.isFinite(amount)) {
    return "0";
  }
  const decimal = new Decimal(amount);
  const places = decimal.decimalPlaces();
  const precision = places > 2 ? 2 : places;
  return decimal.toFixed(precision);
}

function formatHandle(login: string): string {
  const normalized = login.startsWith("@") ? login.slice(1) : login;
  return `@${normalized}`;
}

async function postNoDataComment(context: XpCommandContext, login: string): Promise<void> {
  await postComment(context, `I don't have XP data for ${formatHandle(login)} yet.`);
}

async function postComment(context: XpCommandContext, body: string): Promise<void> {
  const logReturn = context.logger.info(body);
  await context.commentHandler.postComment(context, logReturn, { raw: true, updateComment: false });
}
