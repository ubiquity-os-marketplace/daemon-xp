import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { CommentHandler } from "@ubiquity-os/plugin-sdk";
import { customOctokit as Octokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import { http, HttpResponse } from "msw";
import manifest from "../manifest.json";
import { runPlugin } from "../src";
import { filterCollaborators } from "../src/github/filter-collaborators";
import { getInvolvedUsers } from "../src/github/get-involved-users";
import { overrideXpRequestDependencies, resetXpRequestDependencies } from "../src/http/xp/handle-xp-request";
import { ContextPlugin, Env, SaveXpRecordInput, SupabaseAdapterContract, UserXpTotal } from "../src/types/index";
import { db } from "./__mocks__/db";
import { createTimelineEvent, setupTests } from "./__mocks__/helpers";
import { server } from "./__mocks__/node";

const octokit = new Octokit();
type GetUserTotalWithLogger = typeof import("../src/adapters/supabase/xp/get-user-total").getUserTotalWithLogger;

beforeAll(() => {
  server.listen();
});
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetXpRequestDependencies();
});
afterAll(() => server.close());

describe("Plugin tests", () => {
  beforeEach(async () => {
    drop(db);
    await setupTests();
  });

  it("Should serve the manifest file", async () => {
    const worker = (await import("../src/worker")).default;
    const response = await worker.fetch(new Request("http://localhost/manifest.json"), {
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_KEY: "test-key",
    } as Env);
    const content = await response.json();
    expect(content).toEqual(manifest);
  });

  it("Should create a negative XP record scaled by the issue price when the bot unassigns a user", async () => {
    const supabase = new SupabaseAdapterStub();
    const price = 42.5;
    const { context } = createUnassignedContext({ supabaseAdapter: supabase, timelineActorType: "Bot", priceLabel: `Price: ${price} USD` });
    await runPlugin(context);

    expect(supabase.calls).toHaveLength(1);
    expect(supabase.calls[0]?.numericAmount).toBe(-price);
    expect(supabase.calls[0]?.userId).toBe(context.payload.assignee?.id);
  });

  it("Should scale the malus by the number of collaborators involved", async () => {
    const supabase = new SupabaseAdapterStub();
    const price = 55;
    const { context } = createUnassignedContext({ supabaseAdapter: supabase, timelineActorType: "Bot", priceLabel: `Price: ${price} USD` });
    const assigneeId = context.payload.assignee?.id;
    if (typeof assigneeId === "number") {
      supabase.setUserTotal(assigneeId, 200, 2);
    }
    const originalPaginate = context.octokit.paginate.bind(context.octokit);
    jest.spyOn(context.octokit, "paginate").mockImplementation(async (method: Parameters<typeof context.octokit.paginate>[0], params: string | undefined) => {
      if (params && typeof params === "object" && "issue_number" in params && !("mediaType" in params) && !("pull_number" in params)) {
        return [
          { id: 501, user: { id: 901, login: "collab-one", type: "User" } },
          { id: 502, user: { id: 902, login: "collab-two", type: "User" } },
        ];
      }
      if (params && typeof params === "object" && "pull_number" in params) {
        return [];
      }
      return originalPaginate(method, params);
    });
    server.use(
      http.get("https://api.github.com/repos/:owner/:repo/collaborators/:username/permission", ({ params }) => {
        const { username } = params;
        if (username === "collab-one" || username === "collab-two") {
          return HttpResponse.json({ permission: "write" });
        }
        return HttpResponse.json({ permission: "read" });
      })
    );
    await runPlugin(context);

    expect(supabase.calls).toHaveLength(1);
    expect(supabase.calls[0]?.numericAmount).toBe(-(price * 2));
  });

  it("Should post a malus summary comment including collaborator multiplier and current XP", async () => {
    const supabase = new SupabaseAdapterStub();
    const price = 25;
    const { context } = createUnassignedContext({ supabaseAdapter: supabase, timelineActorType: "Bot", priceLabel: `Price: ${price} USD` });
    const assigneeId = context.payload.assignee?.id;
    if (typeof assigneeId === "number") {
      supabase.setUserTotal(assigneeId, 150, 2);
    }
    const originalPaginate = context.octokit.paginate.bind(context.octokit);
    jest.spyOn(context.octokit, "paginate").mockImplementation(async (method: Parameters<typeof context.octokit.paginate>[0], params: string | undefined) => {
      if (params && typeof params === "object" && "issue_number" in params && !("mediaType" in params) && !("pull_number" in params)) {
        return [{ id: 503, user: { id: 903, login: "collab-one", type: "User" } }];
      }
      if (params && typeof params === "object" && "pull_number" in params) {
        return [];
      }
      return originalPaginate(method, params);
    });
    jest.spyOn(context.octokit.rest.orgs, "getMembershipForUser").mockImplementation(async () => {
      const error = new Error("Not Found") as Error & { status?: number };
      error.status = 404;
      throw error;
    });
    const permissionSpy = jest.spyOn(context.octokit.rest.repos, "getCollaboratorPermissionLevel");
    permissionSpy.mockImplementation(async (args: Parameters<typeof octokit.rest.repos.getCollaboratorPermissionLevel>[0]) => {
      const { username } = (args ?? { username: "" }) as { username: string };
      if (username === "collab-one") {
        return { data: { permission: "write" } } as unknown as Awaited<ReturnType<typeof context.octokit.rest.repos.getCollaboratorPermissionLevel>>;
      }
      return { data: { permission: "read" } } as unknown as Awaited<ReturnType<typeof context.octokit.rest.repos.getCollaboratorPermissionLevel>>;
    });
    const singleInvolvedUsers = await getInvolvedUsers(context);
    expect(singleInvolvedUsers.map((user) => user.login)).toEqual(expect.arrayContaining(["collab-one"]));
    const singleCollaborators = await filterCollaborators(context, singleInvolvedUsers);
    expect(singleCollaborators.map((user) => user.login)).toEqual(expect.arrayContaining(["collab-one"]));
    const commentCountBefore = db.issueComments.count();

    await runPlugin(context);

    expect(supabase.calls).toHaveLength(1);
    expect(db.issueComments.count()).toBe(commentCountBefore + 1);
    const issueComments = db.issueComments.getAll();
    const latestComment = issueComments[issueComments.length - 1];
    expect(latestComment?.body).toContain("Applied a malus of -25");
    expect(latestComment?.body).toContain("Collaborator multiplier: 1 (@collab-one)");
    expect(latestComment?.body).toContain("Current XP");
    expect(latestComment?.body).toContain("125");
    expect(permissionSpy).toHaveBeenCalledWith(expect.objectContaining({ username: "collab-one" }));
  });

  it("Should not create an XP record when the unassignment is not from a bot", async () => {
    const supabase = new SupabaseAdapterStub();
    const { context } = createUnassignedContext({ supabaseAdapter: supabase, timelineActorType: "User" });
    await runPlugin(context);

    expect(supabase.calls).toHaveLength(0);
  });

  it("Should not create an XP record when no matching timeline entry is found", async () => {
    const supabase = new SupabaseAdapterStub();
    const { context } = createUnassignedContext({ supabaseAdapter: supabase, includeTimeline: false });
    await runPlugin(context);

    expect(supabase.calls).toHaveLength(0);
  });

  it("Should not create an XP record when the issue price label is missing", async () => {
    const supabase = new SupabaseAdapterStub();
    const { context } = createUnassignedContext({ supabaseAdapter: supabase, includePriceLabel: false });
    await runPlugin(context);

    expect(supabase.calls).toHaveLength(0);
  });

  it("Should post the sender's XP when the /xp command is used without arguments", async () => {
    const supabase = new SupabaseAdapterStub();
    const commenterId = 1;
    supabase.setUserTotal(commenterId, 42.5, 2);
    const { context } = createIssueCommentContext({ supabaseAdapter: supabase, commentBody: "/xp", commenterId });
    const commentCountBefore = db.issueComments.count();

    await runPlugin(context);

    expect(supabase.xp.getUserTotal).toHaveBeenCalledWith(commenterId);
    expect(db.issueComments.count()).toBe(commentCountBefore + 1);
    const issueComments = db.issueComments.getAll();
    const newComment = issueComments[issueComments.length - 1];
    expect(newComment?.body).toContain("42.5 XP");
  });

  it("Should post XP for the requested username when provided", async () => {
    const supabase = new SupabaseAdapterStub();
    const targetUser = db.users.create({ id: 99, name: "Requested User", login: "requested-user" });
    supabase.setUserTotal(targetUser.id, 17.25, 3);
    const { context } = createIssueCommentContext({ supabaseAdapter: supabase, commentBody: "/xp requested-user" });
    const commentCountBefore = db.issueComments.count();

    await runPlugin(context);

    expect(supabase.xp.getUserTotal).toHaveBeenCalledWith(targetUser.id);
    expect(db.issueComments.count()).toBe(commentCountBefore + 1);
    const issueComments = db.issueComments.getAll();
    const newComment = issueComments[issueComments.length - 1];
    expect(newComment?.body?.startsWith("@requested-user currently has 17.25 XP.")).toBe(true);
  });

  it("Should reply with no data when the requested user does not exist", async () => {
    const supabase = new SupabaseAdapterStub();
    const { context } = createIssueCommentContext({ supabaseAdapter: supabase, commentBody: "/xp missing-user" });
    const commentCountBefore = db.issueComments.count();

    await runPlugin(context);

    expect(supabase.xp.getUserTotal).not.toHaveBeenCalled();
    expect(db.issueComments.count()).toBe(commentCountBefore + 1);
    const issueComments = db.issueComments.getAll();
    const newComment = issueComments[issueComments.length - 1];
    expect(newComment?.body?.startsWith("I don't have XP data for @missing-user yet.")).toBe(true);
  });

  it("Should return XP data from the /xp endpoint", async () => {
    const getUserTotalWithLoggerMock: jest.MockedFunction<GetUserTotalWithLogger> = jest.fn(async (...args: Parameters<GetUserTotalWithLogger>) => {
      const [, , userId] = args;
      if (userId === 1) {
        return { total: 12.5, permitCount: 3 };
      }
      return { total: 0, permitCount: 0 };
    });
    overrideXpRequestDependencies({ getUserTotal: getUserTotalWithLoggerMock });
    const worker = (await import("../src/worker")).default;

    const response = await worker.fetch(new Request("http://localhost/xp?user=user1"), {
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_KEY: "test-key",
    } as Env);

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toEqual({
      users: [
        {
          login: "user1",
          id: 1,
          hasData: true,
          total: 12.5,
          permitCount: 3,
        },
      ],
    });
    expect(getUserTotalWithLoggerMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), 1);
  });

  it("Should return unavailable entries for usernames without XP data", async () => {
    db.users.create({ id: 3, name: "user3", login: "user3" });
    const getUserTotalWithLoggerMock: jest.MockedFunction<GetUserTotalWithLogger> = jest.fn(async (...args: Parameters<GetUserTotalWithLogger>) => {
      const [, , userId] = args;
      if (userId === 3) {
        return { total: 0, permitCount: 0 };
      }
      return { total: 4, permitCount: 1 };
    });
    overrideXpRequestDependencies({ getUserTotal: getUserTotalWithLoggerMock });
    const worker = (await import("../src/worker")).default;

    const response = await worker.fetch(new Request("http://localhost/xp?user=user3&user=missing-user"), {
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_KEY: "test-key",
    } as Env);

    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload).toEqual({
      users: [
        {
          login: "user3",
          hasData: false,
          message: "I don't have XP data for @user3 yet.",
        },
        {
          login: "missing-user",
          hasData: false,
          message: "I don't have XP data for @missing-user yet.",
        },
      ],
    });
    expect(getUserTotalWithLoggerMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), 3);
  });

  it("Should reject /xp requests without usernames", async () => {
    const worker = (await import("../src/worker")).default;

    const response = await worker.fetch(new Request("http://localhost/xp"), {
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_KEY: "test-key",
    } as Env);

    const payload = await response.json();
    expect(response.status).toBe(400);
    expect(payload).toEqual({
      error: {
        code: "missing_usernames",
        message: "At least one username is required. Provide it using the 'user' query parameter.",
      },
    });
  });
});

/**
 * The heart of each test. This function creates a context object with the necessary data for the plugin to run.
 *
 * So long as everything is defined correctly in the db (see `./__mocks__/helpers.ts: setupTests()`),
 * this function should be able to handle any event type and the conditions that come with it.
 *
 * Refactor according to your needs.
 */
function createUnassignedContext(options: {
  supabaseAdapter?: SupabaseAdapterStub;
  timelineActorType?: string;
  includeTimeline?: boolean;
  priceLabel?: string;
  includePriceLabel?: boolean;
}) {
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
    config: {},
    env: {
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_KEY: "test-key",
    } as Env,
    octokit: octokit,
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

function createIssueCommentContext(
  options: {
    supabaseAdapter?: SupabaseAdapterStub;
    commentBody?: string;
    commenterId?: number;
    commentId?: number;
  } = {}
) {
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
    config: {},
    env: {
      SUPABASE_URL: "https://supabase.test",
      SUPABASE_KEY: "test-key",
    } as Env,
    octokit: octokit,
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

class SupabaseAdapterStub implements SupabaseAdapterContract {
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
