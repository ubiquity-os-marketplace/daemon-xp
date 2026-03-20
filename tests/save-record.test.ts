import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import Decimal from "decimal.js";
import { saveXpRecord } from "../src/adapters/supabase/xp/save-record";
import { BASE_UNIT } from "../src/adapters/supabase/xp/get-user-total";
import * as locationAdapter from "../src/adapters/supabase/location/get-or-create-issue-location";

type UserRow = {
  id: number;
};

type PermitRow = {
  id: number;
  amount: string;
  beneficiary_id: number;
  location_id: number | null;
  token_id: number | null;
  nonce: string;
  deadline: string;
  signature: string;
  partner_id: number | null;
};

type PenaltyRow = {
  id: number;
  amount: string | null;
  beneficiary_id: number;
  location_id: number;
};

type TableRows = {
  users: UserRow[];
  permits: PermitRow[];
  xp_penalties: PenaltyRow[];
};

type TableName = keyof TableRows;
type RowFilter = (row: Record<string, unknown>) => boolean;

function matchesFilters(row: Record<string, unknown>, filters: RowFilter[]) {
  for (const filter of filters) {
    if (!filter(row)) {
      return false;
    }
  }
  return true;
}

function createInsertResult(inserted: Record<string, unknown>) {
  const single = async () => ({ data: inserted, error: null });
  return {
    data: inserted,
    error: null,
    select: () => ({ single }),
  };
}

function createContext() {
  return {
    logger: {
      info: () => undefined,
      debug: () => undefined,
      ok: () => undefined,
      error: (message: string, meta?: unknown) => Object.assign(new Error(message), { meta }),
    },
  } as unknown as Parameters<typeof saveXpRecord>[0];
}

function createSupabaseClient(initialState: Partial<TableRows> = {}) {
  const state: TableRows = {
    users: [...(initialState.users ?? [])],
    permits: [...(initialState.permits ?? [])],
    xp_penalties: [...(initialState.xp_penalties ?? [])],
  };
  const nextIds = {
    permits: Math.max(0, ...state.permits.map((row) => row.id)) + 1,
    xp_penalties: Math.max(0, ...state.xp_penalties.map((row) => row.id)) + 1,
  };

  return {
    state,
    client: {
      from: (table: TableName) => {
        const filters: RowFilter[] = [];
        const builder = {
          select: () => builder,
          eq: (field: string, value: unknown) => {
            filters.push((row) => row[field] === value);
            return builder;
          },
          is: (field: string, value: unknown) => {
            filters.push((row) => row[field] === value);
            return builder;
          },
          maybeSingle: async () => {
            const rows = state[table].filter((row) => matchesFilters(row as Record<string, unknown>, filters));
            return { data: rows[0] ?? null, error: null };
          },
          insert: (payload: Record<string, unknown>) => {
            const inserted = { ...payload } as Record<string, unknown>;
            if (table === "permits" || table === "xp_penalties") {
              inserted.id = nextIds[table]++;
            }
            state[table].push(inserted as never);
            return createInsertResult(inserted);
          },
          update: (patch: Record<string, unknown>) => ({
            eq: async (field: string, value: unknown) => {
              for (const row of state[table]) {
                if ((row as Record<string, unknown>)[field] === value) {
                  Object.assign(row, patch);
                }
              }
              return { error: null };
            },
          }),
        };
        return builder;
      },
    } as unknown as Parameters<typeof saveXpRecord>[1],
  };
}

function toBaseUnitAmount(value: number) {
  return new Decimal(value).mul(BASE_UNIT).toFixed();
}

afterEach(() => {
  mock.restore();
});

describe("saveXpRecord", () => {
  it("inserts positive XP into permits", async () => {
    const { client, state } = createSupabaseClient();
    spyOn(locationAdapter, "getOrCreateIssueLocation").mockResolvedValue(77);

    await saveXpRecord(createContext(), client, {
      userId: 42,
      issue: { issueId: 100, issueUrl: "https://github.com/ubiquity/test-repo/issues/100" },
      numericAmount: 12.5,
    });

    expect(state.permits).toHaveLength(1);
    expect(state.xp_penalties).toHaveLength(0);
    expect(state.permits[0]).toMatchObject({
      amount: toBaseUnitAmount(12.5),
      beneficiary_id: 42,
      location_id: 77,
      token_id: null,
    });
  });

  it("inserts negative XP into xp_penalties", async () => {
    const { client, state } = createSupabaseClient();
    spyOn(locationAdapter, "getOrCreateIssueLocation").mockResolvedValue(77);

    await saveXpRecord(createContext(), client, {
      userId: 42,
      issue: { issueId: 101, issueUrl: "https://github.com/ubiquity/test-repo/issues/101" },
      numericAmount: -3.75,
    });

    expect(state.permits).toHaveLength(0);
    expect(state.xp_penalties).toHaveLength(1);
    expect(state.xp_penalties[0]).toMatchObject({
      amount: toBaseUnitAmount(-3.75),
      beneficiary_id: 42,
      location_id: 77,
    });
  });

  it("updates an existing permit for the same user and issue location", async () => {
    const { client, state } = createSupabaseClient({
      users: [{ id: 42 }],
      permits: [
        {
          id: 5,
          amount: toBaseUnitAmount(1),
          beneficiary_id: 42,
          location_id: 77,
          token_id: null,
          nonce: "nonce",
          deadline: "",
          signature: "signature",
          partner_id: null,
        },
      ],
    });
    spyOn(locationAdapter, "getOrCreateIssueLocation").mockResolvedValue(77);

    await saveXpRecord(createContext(), client, {
      userId: 42,
      issue: { issueId: 102, issueUrl: "https://github.com/ubiquity/test-repo/issues/102" },
      numericAmount: 8,
    });

    expect(state.permits).toHaveLength(1);
    expect(state.permits[0]?.amount).toBe(toBaseUnitAmount(8));
  });

  it("updates an existing penalty for the same user and issue location", async () => {
    const { client, state } = createSupabaseClient({
      users: [{ id: 42 }],
      xp_penalties: [
        {
          id: 9,
          amount: toBaseUnitAmount(-1),
          beneficiary_id: 42,
          location_id: 77,
        },
      ],
    });
    spyOn(locationAdapter, "getOrCreateIssueLocation").mockResolvedValue(77);

    await saveXpRecord(createContext(), client, {
      userId: 42,
      issue: { issueId: 103, issueUrl: "https://github.com/ubiquity/test-repo/issues/103" },
      numericAmount: -6.5,
    });

    expect(state.xp_penalties).toHaveLength(1);
    expect(state.xp_penalties[0]?.amount).toBe(toBaseUnitAmount(-6.5));
  });
});
