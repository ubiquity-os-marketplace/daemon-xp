import { describe, expect, it } from "bun:test";
import { fetchUserTotal } from "../src/adapters/supabase/xp/get-user-total";
import type { UserXpScopeOptions } from "../src/types";

const logger = {
  info: () => ({ logMessage: { raw: "", diff: "", level: "info", type: "info" } }),
  debug: () => ({ logMessage: { raw: "", diff: "", level: "debug", type: "debug" } }),
  ok: () => ({ logMessage: { raw: "", diff: "", level: "info", type: "ok" } }),
  error: () => ({ logMessage: { raw: "", diff: "", level: "error", type: "error" } }),
} as Parameters<typeof fetchUserTotal>[0];

type XpRecordRow = {
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

type TablePages = Partial<Record<"permits" | "xp_penalties", XpRecordRow[][]>>;

function createSupabaseClient(pagesByTable: TablePages) {
  const callIndex: Record<"permits" | "xp_penalties", number> = {
    permits: 0,
    xp_penalties: 0,
  };
  return {
    from: (table: "permits" | "xp_penalties") => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        range: async () => {
          const tablePages = pagesByTable[table] ?? [];
          const data = tablePages[callIndex[table]] ?? [];
          callIndex[table] += 1;
          return { data, error: null };
        },
      };
      return builder;
    },
  } as unknown as Parameters<typeof fetchUserTotal>[1];
}

describe("fetchUserTotal", () => {
  it("computes scoped totals across permits and penalties", async () => {
    const client = createSupabaseClient({
      permits: [
        [
          { amount: "1000000000000000000", locations: { node_url: "https://github.com/ubiquity/repo-a/issues/1" } },
          { amount: "2000000000000000000", locations: [{ node_url: "https://github.com/ubiquity/repo-b/issues/2" }] },
          { amount: "500000000000000000", locations: { node_url: "https://github.com/ubiquity/repo-a/issues/3" } },
        ],
      ],
      xp_penalties: [
        [
          { amount: "-250000000000000000", locations: { node_url: "https://github.com/ubiquity/repo-a/issues/4" } },
          { amount: "-1000000000000000000", locations: { node_url: "https://github.com/other-org/repo-c/issues/5" } },
        ],
      ],
    });
    const options: UserXpScopeOptions = { repositoryOwner: "ubiquity", repositoryName: "repo-a", organizationLogin: "ubiquity" };

    const result = await fetchUserTotal(logger, client, 1, options);

    expect(result.permitCount).toBe(5);
    expect(result.total).toBeCloseTo(2.25, 5);
    expect(result.scopes?.global).toBeCloseTo(2.25, 5);
    expect(result.scopes?.repo).toBeCloseTo(1.25, 5);
    expect(result.scopes?.org).toBeCloseTo(3.25, 5);
  });

  it("omits scopes when no scope options are provided", async () => {
    const client = createSupabaseClient({
      permits: [[{ amount: "1000000000000000000" }]],
    });

    const result = await fetchUserTotal(logger, client, 1);

    expect(result.permitCount).toBe(1);
    expect(result.total).toBeCloseTo(1.0, 5);
    expect(result.scopes).toBeUndefined();
  });

  it("returns penalty-only totals as valid XP data", async () => {
    const client = createSupabaseClient({
      xp_penalties: [[{ amount: "-1250000000000000000" }]],
    });

    const result = await fetchUserTotal(logger, client, 1);

    expect(result.permitCount).toBe(1);
    expect(result.total).toBeCloseTo(-1.25, 5);
    expect(result.scopes).toBeUndefined();
  });
});
