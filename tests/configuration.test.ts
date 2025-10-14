import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { drop } from "@mswjs/data";
import { customOctokit as Octokit } from "@ubiquity-os/plugin-sdk/octokit";
import { runPlugin } from "../src";
import { resetXpRequestDependencies } from "../src/http/xp/handle-xp-request";
import { db } from "./__mocks__/db";
import { setupTests } from "./__mocks__/helpers";
import { server } from "./__mocks__/node";
import { createUnassignedContext, SupabaseAdapterStub } from "./__mocks__/test-context";

const octokit = new Octokit();

beforeAll(() => {
  server.listen();
});

afterEach(() => {
  server.resetHandlers();
  jest.clearAllMocks();
  jest.restoreAllMocks();
  resetXpRequestDependencies();
});

afterAll(() => {
  server.close();
});

describe("Configuration", () => {
  beforeEach(async () => {
    drop(db);
    await setupTests();
  });

  it("Should skip posting comments when disabled", async () => {
    const supabase = new SupabaseAdapterStub();
    const { context, infoSpy } = createUnassignedContext({
      supabaseAdapter: supabase,
      timelineActorType: "Bot",
      priceLabel: "Price: 20",
      config: { disableCommentPosting: true },
      octokit,
    });
    const commentCountBefore = db.issueComments.count();

    await runPlugin(context);

    expect(supabase.calls).toHaveLength(1);
    expect(db.issueComments.count()).toBe(commentCountBefore);
    expect(infoSpy).toHaveBeenCalledWith("Comment posting disabled via configuration.");
  });
});
