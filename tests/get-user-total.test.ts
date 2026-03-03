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

function createSupabaseClient(tablePages: Record<string, PermitRow[][]>) {
  const tableCallIndex = new Map<string, number>();

  const createBuilder = (tableName: string) => ({
    select: () => createBuilder(tableName),
    eq: () => createBuilder(tableName),
    range: async () => {
      const currentIndex = tableCallIndex.get(tableName) ?? 0;
      const pages = tablePages[tableName] ?? [];
      const data = pages[currentIndex] ?? [];
      tableCallIndex.set(tableName, currentIndex + 1);
      return { data, error: null };
    },
  });

  return {
    from: (tableName: string) => createBuilder(tableName),
  } as unknown as Parameters<typeof fetchUserTotal>[1];
}

describe("fetchUserTotal", () => {
  it("computes scoped totals by parsing repository and organization from node_url", async () => {
    const permitsPages: PermitRow[][] = [
      [
        { amount: "1000000000000000000", locations: { node_url: "https://github.com/ubiquity/repo-a/issues/1" } },
        { amount: "2000000000000000000", locations: [{ node_url: "https://github.com/ubiquity/repo-b/issues/2" }] },
        { amount: "500000000000000000", locations: { node_url: "https://github.com/ubiquity/repo-a/issues/3" } },
        { amount: "1500000000000000000", locations: { node_url: "https://github.com/other-org/repo-c/issues/4" } },
      ],
    ];
    const client = createSupabaseClient({ permits: permitsPages });
    const options: UserXpScopeOptions = { repositoryOwner: "ubiquity", repositoryName: "repo-a", organizationLogin: "ubiquity" };

    const result = await fetchUserTotal(logger, client, 1, options);

    expect(result.permitCount).toBe(4);
    expect(result.total).toBeCloseTo(5.0, 5);
    expect(result.scopes?.global).toBeCloseTo(5.0, 5);
    expect(result.scopes?.repo).toBeCloseTo(1.5, 5);
    expect(result.scopes?.org).toBeCloseTo(3.5, 5);
  });

  it("aggregates totals across positive and negative XP tables", async () => {
    const client = createSupabaseClient({
      permits: [[{ amount: "2000000000000000000", locations: { node_url: "https://github.com/ubiquity/repo-a/issues/1" } }]],
      negative_permits: [
        [
          { amount: "-500000000000000000", locations: { node_url: "https://github.com/ubiquity/repo-a/issues/2" } },
          { amount: "-250000000000000000", locations: { node_url: "https://github.com/other-org/repo-z/issues/3" } },
        ],
      ],
    });

    const options: UserXpScopeOptions = { repositoryOwner: "ubiquity", repositoryName: "repo-a", organizationLogin: "ubiquity" };
    const result = await fetchUserTotal(logger, client, 1, options);

    expect(result.permitCount).toBe(3);
    expect(result.total).toBeCloseTo(1.25, 5);
    expect(result.scopes?.global).toBeCloseTo(1.25, 5);
    expect(result.scopes?.repo).toBeCloseTo(1.5, 5);
    expect(result.scopes?.org).toBeCloseTo(1.5, 5);
  });

  it("omits scopes when no scope options are provided", async () => {
    const client = createSupabaseClient({ permits: [[{ amount: "1000000000000000000" }]] });

    const result = await fetchUserTotal(logger, client, 1);

    expect(result.permitCount).toBe(1);
    expect(result.total).toBeCloseTo(1.0, 5);
    expect(result.scopes).toBeUndefined();
  });
});
