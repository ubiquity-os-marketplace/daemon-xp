import { CommentHandler } from "@ubiquity-os/plugin-sdk";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import { mock, spyOn } from "bun:test";
import { ContextPlugin, Env, PluginSettings, SaveXpRecordInput, SupabaseAdapterContract, UserXpScopeOptions, UserXpTotal } from "../../src/types/index";
import { db } from "./db";
import { createTimelineEvent } from "./helpers";
export class SupabaseAdapterStub implements SupabaseAdapterContract {
  calls: SaveXpRecordInput[] = [];
  private readonly _xpTotals = new Map<number, UserXpTotal>();

  location = { getOrCreateIssueLocation: mock(async () => 1) };

  xp = {
    saveRecord: mock(async (input: SaveXpRecordInput) => {
      this.calls.push(input);
      const current = this._xpTotals.get(input.userId) ?? { total: 0, permitCount: 0 };
      const nextTotal = current.total + input.numericAmount;
      const permitCount = current.permitCount > 0 ? current.permitCount : 1;
      this._xpTotals.set(input.userId, { total: nextTotal, permitCount });
    }),
    getUserTotal: mock(async (userId: number, options?: UserXpScopeOptions) => {
      const current = this._xpTotals.get(userId) ?? { total: 0, permitCount: 0 };
      if (options?.repositoryOwner || options?.repositoryName || options?.organizationLogin) {
        return {
          ...current,
          scopes: {
            global: current.total,
            repo: current.total,
            org: current.total,
          },
        };
      }
      return current;
    }),
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
  includeDisqualifierComment?: boolean;
};

export function createUnassignedContext(options: CreateUnassignedContextOptions) {
  const defaultConfig = { disableCommentPosting: false, disqualificationBanThreshold: -2000 } as const;
  if (options.includePriceLabel === false) {
    db.issue.update({ where: { id: { equals: 1 } }, data: { labels: [] } });
  } else if (typeof options.priceLabel === "string") {
    db.issue.update({ where: { id: { equals: 1 } }, data: { labels: [{ name: options.priceLabel }] } });
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
  const assignee = { ...assigneeRecord, type: "User" } as unknown as ContextPlugin<"issues.unassigned">["payload"]["assignee"];
  if (typeof options.issueAuthorId === "number") {
    const authorRecord = db.users.findFirst({ where: { id: { equals: options.issueAuthorId } } });
    if (authorRecord) {
      issue.user = { id: authorRecord.id, login: authorRecord.login, type: "User" } as unknown as NonNullable<typeof issue.user>;
    }
  }
  const supabaseAdapter = options.supabaseAdapter ?? new SupabaseAdapterStub();
  if (options.includeTimeline !== false) {
    if (options.includeDisqualifierComment) {
      const marker = "<!-- Ubiquity OS - Daemon XP - Step - @ubiquity-os/daemon-disqualifier -->";
      createTimelineEvent(issue.number, {
        actor: { id: sender.id, login: sender.login, type: "Bot" },
        created_at: new Date(Date.now() - 1000).toISOString(),
        eventName: "commented",
        body: `${marker}\nDisqualified due to inactivity.`,
        body_html: marker,
        body_text: "Disqualified due to inactivity.",
      });
    }
    createTimelineEvent(issue.number, {
      actor: { id: sender.id, login: sender.login, type: options.timelineActorType ?? "Bot" },
      assignee: { id: assigneeRecord.id, login: assigneeRecord.login },
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
    config: { ...defaultConfig, ...(options.config ?? {}) } as PluginSettings,
    env: { SUPABASE_URL: "https://supabase.test", SUPABASE_KEY: "test-key" } as Env,
    octokit: options.octokit,
    commentHandler: new CommentHandler(),
    adapters: { supabase: supabaseAdapter },
  } as unknown as ContextPlugin<"issues.unassigned">;
  spyOn(context.octokit.graphql, "paginate").mockResolvedValue({
    repository: { issue: { closedByPullRequestsReferences: { edges: [] } } },
  } as unknown as Record<string, unknown>);
  const debugSpy = spyOn(context.logger, "debug");
  const infoSpy = spyOn(context.logger, "info");
  const errorSpy = spyOn(context.logger, "error");
  const okSpy = spyOn(context.logger, "ok");
  return { context, debugSpy, infoSpy, errorSpy, okSpy, supabaseAdapter };
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
  const sender = { ...commenterRecord, type: "User" } as unknown as ContextPlugin["payload"]["sender"];
  const comment = {
    id: options.commentId ?? Date.now(),
    body: options.commentBody ?? "/xp",
    user: { login: commenterRecord.login, id: commenterRecord.id, type: "User" },
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
    env: { SUPABASE_URL: "https://supabase.test", SUPABASE_KEY: "test-key" } as Env,
    octokit: options.octokit,
    commentHandler: new CommentHandler(),
    adapters: { supabase: supabaseAdapter },
  } as unknown as ContextPlugin<"issue_comment.created">;
  spyOn(context.octokit.graphql, "paginate").mockResolvedValue({
    repository: { issue: { closedByPullRequestsReferences: { edges: [] } } },
  } as unknown as Record<string, unknown>);
  return { context, supabaseAdapter };
}

type CreateReviewContextOptions = {
  supabaseAdapter?: SupabaseAdapterContract;
  reviewBody?: string;
  commenterId?: number;
  config?: Partial<PluginSettings>;
  octokit: ContextPlugin["octokit"];
};

function createReviewBase(options: CreateReviewContextOptions) {
  const supabaseAdapter = options.supabaseAdapter ?? new SupabaseAdapterStub();
  const repoRecord = db.repo.findFirst({ where: { id: { equals: 1 } } });
  const issueRecord = db.issue.findFirst({ where: { id: { equals: 1 } } });
  const commenterRecord = db.users.findFirst({ where: { id: { equals: options.commenterId ?? 1 } } });
  if (!repoRecord || !issueRecord || !commenterRecord) {
    throw new Error("Test fixtures missing required records for review context");
  }
  const repo = repoRecord as unknown as ContextPlugin<"issue_comment.created">["payload"]["repository"];
  const issue = issueRecord as unknown as ContextPlugin<"issue_comment.created">["payload"]["issue"];
  const sender = { ...commenterRecord, type: "User" } as unknown as ContextPlugin<"issue_comment.created">["payload"]["sender"];
  const pullRequest = {
    number: issue.number,
    id: issue.id,
    user: sender,
  } as unknown as ContextPlugin<"pull_request_review_comment.created">["payload"]["pull_request"];

  const base = {
    command: { name: "xp", parameters: { username: commenterRecord.login } },
    payload: {
      repository: repo,
      organization: { login: repo.owner.login, id: repo.owner.id },
      sender,
      issue,
      pull_request: pullRequest,
      installation: { id: 1 } as ContextPlugin["payload"]["installation"],
    },
    logger: new Logs("debug"),
    config: (options.config ?? {}) as PluginSettings,
    env: { SUPABASE_URL: "https://supabase.test", SUPABASE_KEY: "test-key" } as Env,
    octokit: options.octokit,
    commentHandler: new CommentHandler(),
    adapters: { supabase: supabaseAdapter },
  };
  spyOn(base.octokit.graphql, "paginate").mockResolvedValue({
    repository: { issue: { closedByPullRequestsReferences: { edges: [] } } },
  } as unknown as Record<string, unknown>);
  return { base, supabaseAdapter, commenterRecord };
}

export function createReviewCommentContext(options: CreateReviewContextOptions) {
  const { base, supabaseAdapter, commenterRecord } = createReviewBase(options);
  const comment = {
    id: Date.now(),
    body: options.reviewBody ?? "/xp",
    user: { login: commenterRecord.login, id: commenterRecord.id, type: "User" },
  } as ContextPlugin<"pull_request_review_comment.created">["payload"]["comment"];

  const context = {
    ...base,
    eventName: "pull_request_review_comment.created",
    payload: {
      ...base.payload,
      action: "created",
      comment,
    },
  } as unknown as ContextPlugin<"pull_request_review_comment.created">;

  return { context, supabaseAdapter };
}

export function createReviewSubmittedContext(options: CreateReviewContextOptions) {
  const { base, supabaseAdapter } = createReviewBase(options);
  const review = {
    id: Date.now(),
    body: options.reviewBody ?? "/xp",
    user: base.payload.sender,
    state: "commented",
  } as ContextPlugin<"pull_request_review.submitted">["payload"]["review"];

  const context = {
    ...base,
    eventName: "pull_request_review.submitted",
    payload: {
      ...base.payload,
      action: "submitted",
      review,
    },
  } as unknown as ContextPlugin<"pull_request_review.submitted">;

  return { context, supabaseAdapter };
}
