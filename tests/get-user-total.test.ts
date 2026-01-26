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
        repository_id: number | null;
        organization_id: number | null;
      }
    | {
        repository_id: number | null;
        organization_id: number | null;
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
  it("computes scoped totals when repository and organization ids are provided", async () => {
    const pages: PermitRow[][] = [
      [
        { amount: "1000000000000000000", locations: { repository_id: 10, organization_id: 20 } },
        { amount: "2500000000000000000", locations: [{ repository_id: 11, organization_id: 20 }] },
        { amount: "500000000000000000", locations: { repository_id: 10, organization_id: 21 } },
        { amount: "1000000000000000000", locations: null },
      ],
    ];
    const client = createSupabaseClient(pages);
    const options: UserXpScopeOptions = { repositoryId: 10, organizationId: 20 };

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
