import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { customOctokit as Octokit } from "@ubiquity-os/plugin-sdk/octokit";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import dotenv from "dotenv";
import manifest from "../manifest.json";
import { runPlugin } from "../src";
import * as adaptersModule from "../src/adapters";
import { ContextPlugin, Env, SaveXpRecordInput, SupabaseAdapterContract } from "../src/types";
import { db } from "./__mocks__/db";
import { createTimelineEvent, setupTests } from "./__mocks__/helpers";
import { server } from "./__mocks__/node";

dotenv.config();
const octokit = new Octokit();

beforeAll(() => {
  server.listen();
});
afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
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
    const adaptersSpy = jest
      .spyOn(adaptersModule, "createAdapters")
      .mockReturnValue({ supabase: supabase as unknown as ReturnType<typeof adaptersModule.createAdapters>["supabase"] });

    await runPlugin(context);

    expect(supabase.calls).toHaveLength(1);
    expect(supabase.calls[0]?.numericAmount).toBe(-price);
    expect(supabase.calls[0]?.userId).toBe(context.payload.assignee?.id);
    adaptersSpy.mockRestore();
  });

  it("Should not create an XP record when the unassignment is not from a bot", async () => {
    const supabase = new SupabaseAdapterStub();
    const { context } = createUnassignedContext({ supabaseAdapter: supabase, timelineActorType: "User" });
    const adaptersSpy = jest
      .spyOn(adaptersModule, "createAdapters")
      .mockReturnValue({ supabase: supabase as unknown as ReturnType<typeof adaptersModule.createAdapters>["supabase"] });

    await runPlugin(context);

    expect(supabase.calls).toHaveLength(0);
    adaptersSpy.mockRestore();
  });

  it("Should not create an XP record when no matching timeline entry is found", async () => {
    const supabase = new SupabaseAdapterStub();
    const { context } = createUnassignedContext({ supabaseAdapter: supabase, includeTimeline: false });
    const adaptersSpy = jest
      .spyOn(adaptersModule, "createAdapters")
      .mockReturnValue({ supabase: supabase as unknown as ReturnType<typeof adaptersModule.createAdapters>["supabase"] });

    await runPlugin(context);

    expect(supabase.calls).toHaveLength(0);
    adaptersSpy.mockRestore();
  });

  it("Should not create an XP record when the issue price label is missing", async () => {
    const supabase = new SupabaseAdapterStub();
    const { context } = createUnassignedContext({ supabaseAdapter: supabase, includePriceLabel: false });
    const adaptersSpy = jest
      .spyOn(adaptersModule, "createAdapters")
      .mockReturnValue({ supabase: supabase as unknown as ReturnType<typeof adaptersModule.createAdapters>["supabase"] });

    await runPlugin(context);

    expect(supabase.calls).toHaveLength(0);
    adaptersSpy.mockRestore();
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
    adapters: {
      supabase: supabaseAdapter,
    },
  } as unknown as ContextPlugin;
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

class SupabaseAdapterStub implements SupabaseAdapterContract {
  calls: SaveXpRecordInput[] = [];

  location = {
    getOrCreateIssueLocation: jest.fn(async () => 1),
  };

  xp = {
    saveRecord: jest.fn(async (input: SaveXpRecordInput) => {
      this.calls.push(input);
    }),
  };
}
