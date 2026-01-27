import { describe, expect, it } from "bun:test";
import { fetchUserTotal } from "../src/adapters/supabase/xp/get-user-total";
import type { UserXpScopeOptions } from "../src/types";

const logger = {
  info: () => ({ logMessage: { raw: "", diff: "", level: "info", type: "info" } }),
  debug: () => ({ logMessage: { raw: "", diff: "", level: "debug", type: "debug" } }),
  ok: () => ({ logMessage: { raw: "", diff: "", level: "info", type: "ok" } }),
  error: () => ({ logMessage: { raw: "", diff: "", level: "error", type: "error" } }),
} as Parameters<typeof fetchUserTotal>[0];

type PermitRow = {
  amount: string;
  locations?:
    | {
        node_url: string | null;
      }
    | {
        node_url: string | null;
      }[]
    | null;
};

function createSupabaseClient(pages: PermitRow[][]) {
  let callIndex = 0;
  const builder = {
    select: () => builder,
    eq: () => builder,
    range: async () => {
      const data = pages[callIndex] ?? [];
      callIndex += 1;
      return { data, error: null };
    },
  };
  return {
    from: () => builder,
  } as unknown as Parameters<typeof fetchUserTotal>[1];
}

describe("fetchUserTotal", () => {
  it("computes scoped totals by parsing repository and organization from node_url", async () => {
    const pages: PermitRow[][] = [
      [
        { amount: "1000000000000000000", locations: { node_url: "https://github.com/ubiquity/repo-a/issues/1" } },
        { amount: "2000000000000000000", locations: [{ node_url: "https://github.com/ubiquity/repo-b/issues/2" }] },
        { amount: "500000000000000000", locations: { node_url: "https://github.com/ubiquity/repo-a/issues/3" } },
        { amount: "1500000000000000000", locations: { node_url: "https://github.com/other-org/repo-c/issues/4" } },
      ],
    ];
    const client = createSupabaseClient(pages);
    const options: UserXpScopeOptions = { repositoryOwner: "ubiquity", repositoryName: "repo-a", organizationLogin: "ubiquity" };

    const result = await fetchUserTotal(logger, client, 1, options);

    expect(result.permitCount).toBe(4);
    expect(result.total).toBeCloseTo(5.0, 5);
    expect(result.scopes?.global).toBeCloseTo(5.0, 5);
    expect(result.scopes?.repo).toBeCloseTo(1.5, 5);
    expect(result.scopes?.org).toBeCloseTo(3.5, 5);
  });

  it("omits scopes when no scope options are provided", async () => {
    const pages: PermitRow[][] = [[{ amount: "1000000000000000000" }]];
    const client = createSupabaseClient(pages);

    const result = await fetchUserTotal(logger, client, 1);

    expect(result.permitCount).toBe(1);
    expect(result.total).toBeCloseTo(1.0, 5);
    expect(result.scopes).toBeUndefined();
  });
});
