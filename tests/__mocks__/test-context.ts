import { jest } from "@jest/globals";
import { CommentHandler } from "@ubiquity-os/plugin-sdk";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import { ContextPlugin, Env, PluginSettings, SaveXpRecordInput, SupabaseAdapterContract, UserXpTotal } from "../../src/types/index";
import { db } from "./db";
import { createTimelineEvent } from "./helpers";
export class SupabaseAdapterStub implements SupabaseAdapterContract {
  calls: SaveXpRecordInput[] = [];
  private readonly _xpTotals = new Map<number, UserXpTotal>();

  location = {
    getOrCreateIssueLocation: jest.fn(async () => 1),
  };

  xp = {
    saveRecord: jest.fn(async (input: SaveXpRecordInput) => {
      this.calls.push(input);
      const current = this._xpTotals.get(input.userId) ?? { total: 0, permitCount: 0 };
      const nextTotal = current.total + input.numericAmount;
      const permitCount = current.permitCount > 0 ? current.permitCount : 1;
      this._xpTotals.set(input.userId, {
        total: nextTotal,
        permitCount,
      });
    }),
    getUserTotal: jest.fn(async (userId: number) => this._xpTotals.get(userId) ?? { total: 0, permitCount: 0 }),
  };

  setUserTotal(userId: number, total: number, permitCount = 1) {
    this._xpTotals.set(userId, { total, permitCount });
  }
}

type CreateUnassignedContextOptions = {
  supabaseAdapter?: SupabaseAdapterContract;
  timelineActorType?: string;
  includeTimeline?: boolean;
  priceLabel?: string;
  includePriceLabel?: boolean;
  config?: Partial<PluginSettings>;
  octokit: ContextPlugin["octokit"];
  issueAuthorId?: number;
};

export function createUnassignedContext(options: CreateUnassignedContextOptions) {
  if (options.includePriceLabel === false) {
    db.issue.update({
      where: { id: { equals: 1 } },
      data: { labels: [] },
    });
  } else if (typeof options.priceLabel === "string") {
    db.issue.update({
      where: { id: { equals: 1 } },
      data: { labels: [{ name: options.priceLabel }] },
    });
  }
  const repoRecord = db.repo.findFirst({ where: { id: { equals: 1 } } });
  const senderRecord = db.users.findFirst({ where: { id: { equals: 1 } } });
  const issueRecord = db.issue.findFirst({ where: { id: { equals: 1 } } });
  const assigneeRecord = db.users.findFirst({ where: { id: { equals: 2 } } });
  if (!repoRecord || !senderRecord || !issueRecord || !assigneeRecord) {
    throw new Error("Test fixtures missing required records");
  }
  const repo = repoRecord as unknown as ContextPlugin["payload"]["repository"];
  const sender = senderRecord as unknown as ContextPlugin["payload"]["sender"];
  const issue = issueRecord as unknown as ContextPlugin<"issues.unassigned">["payload"]["issue"];
  const assignee = {
    ...assigneeRecord,
    type: "User",
  } as unknown as ContextPlugin<"issues.unassigned">["payload"]["assignee"];
  if (typeof options.issueAuthorId === "number") {
    const authorRecord = db.users.findFirst({ where: { id: { equals: options.issueAuthorId } } });
    if (authorRecord) {
      issue.user = {
        id: authorRecord.id,
        login: authorRecord.login,
        type: "User",
      } as unknown as NonNullable<typeof issue.user>;
    }
  }
  const supabaseAdapter = options.supabaseAdapter ?? new SupabaseAdapterStub();
  if (options.includeTimeline !== false) {
    createTimelineEvent(issue.number, {
      actor: {
        id: sender.id,
        login: sender.login,
        type: options.timelineActorType ?? "Bot",
      },
      assignee: {
        id: assigneeRecord.id,
        login: assigneeRecord.login,
      },
    });
  }
  const context = {
    eventName: "issues.unassigned",
    command: null,
    payload: {
      action: "unassigned",
      sender,
      repository: repo,
      issue,
      assignee,
      installation: { id: 1 } as ContextPlugin["payload"]["installation"],
      organization: { login: repo.owner.login } as ContextPlugin["payload"]["organization"],
    },
    logger: new Logs("debug"),
    config: (options.config ?? {}) as PluginSettings,
    env: {
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_KEY: "test-key",
    } as Env,
    octokit: options.octokit,
    commentHandler: new CommentHandler(),
    adapters: {
      supabase: supabaseAdapter,
    },
  } as unknown as ContextPlugin<"issues.unassigned">;
  const infoSpy = jest.spyOn(context.logger, "info");
  const errorSpy = jest.spyOn(context.logger, "error");
  const okSpy = jest.spyOn(context.logger, "ok");
  return {
    context,
    infoSpy,
    errorSpy,
    okSpy,
    supabaseAdapter,
  };
}

type CreateIssueCommentContextOptions = {
  supabaseAdapter?: SupabaseAdapterContract;
  commentBody?: string;
  commenterId?: number;
  commentId?: number;
  config?: Partial<PluginSettings>;
  octokit: ContextPlugin["octokit"];
};

export function createIssueCommentContext(options: CreateIssueCommentContextOptions) {
  const supabaseAdapter = options.supabaseAdapter ?? new SupabaseAdapterStub();
  const repoRecord = db.repo.findFirst({ where: { id: { equals: 1 } } });
  const issueRecord = db.issue.findFirst({ where: { id: { equals: 1 } } });
  const commenterRecord = db.users.findFirst({ where: { id: { equals: options.commenterId ?? 1 } } });
  if (!repoRecord || !issueRecord || !commenterRecord) {
    throw new Error("Test fixtures missing required records for issue comment context");
  }
  const repo = repoRecord as unknown as ContextPlugin["payload"]["repository"];
  const issue = issueRecord as unknown as ContextPlugin<"issue_comment.created">["payload"]["issue"];
  const sender = {
    ...commenterRecord,
    type: "User",
  } as unknown as ContextPlugin["payload"]["sender"];
  const comment = {
    id: options.commentId ?? Date.now(),
    body: options.commentBody ?? "/xp",
    user: {
      login: commenterRecord.login,
      id: commenterRecord.id,
      type: "User",
    },
  } as ContextPlugin<"issue_comment.created">["payload"]["comment"];
  const context = {
    eventName: "issue_comment.created",
    command: null,
    payload: {
      action: "created",
      comment,
      issue,
      repository: repo,
      sender,
      installation: { id: 1 } as ContextPlugin["payload"]["installation"],
      organization: { login: repo.owner.login } as ContextPlugin["payload"]["organization"],
    },
    logger: new Logs("debug"),
    config: (options.config ?? {}) as PluginSettings,
    env: {
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_KEY: "test-key",
    } as Env,
    octokit: options.octokit,
    commentHandler: new CommentHandler(),
    adapters: {
      supabase: supabaseAdapter,
    },
  } as unknown as ContextPlugin<"issue_comment.created">;
  return {
    context,
    supabaseAdapter,
  };
}
