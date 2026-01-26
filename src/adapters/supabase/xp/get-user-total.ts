import type { SupabaseClient } from "@supabase/supabase-js";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import Decimal from "decimal.js";
import { UserXpScopeOptions, UserXpTotal } from "../../../types/supabase";
import { Database } from "../generated-types";

export const BASE_UNIT = new Decimal(10).pow(18);

type Logger = Pick<Logs, "info" | "debug" | "ok" | "error">;

type PermitLocation = {
  repository_id: number | null;
  organization_id: number | null;
};

type PermitRow = {
  amount: string | null;
  locations?: PermitLocation | PermitLocation[] | null;
};

type ScopeInfo = {
  enabled: boolean;
  repositoryId?: number;
  organizationId?: number;
};

export async function fetchUserTotal(logger: Logger, client: SupabaseClient<Database>, userId: number, options?: UserXpScopeOptions): Promise<UserXpTotal> {
  logger.info(`Fetching XP permits for userId: ${userId}`);
  const scope = buildScope(options);
  const totals = await collectTotals(logger, client, userId, scope);
  if (totals.permitCount === 0) {
    logger.debug(`No XP permits found for userId: ${userId}`);
    return buildEmptyTotal(scope);
  }
  const normalized = totals.total.div(BASE_UNIT);
  logger.ok(`XP permits fetched successfully for userId: ${userId}`);
  const result: UserXpTotal = {
    total: normalized.toNumber(),
    permitCount: totals.permitCount,
  };
  return scope.enabled ? applyScopes(result, totals, scope) : result;
}

function normalizeLocation(location: PermitRow["locations"]): PermitLocation | undefined {
  if (!location) {
    return undefined;
  }
  if (Array.isArray(location)) {
    return location[0] ?? undefined;
  }
  return location;
}

async function fetchPermitPage(
  logger: Logger,
  client: SupabaseClient<Database>,
  userId: number,
  from: number,
  pageSize: number,
  includeScopeData: boolean
): Promise<PermitRow[]> {
  const permits = await client
    .from("permits")
    .select(includeScopeData ? "amount,locations(repository_id,organization_id)" : "amount")
    .eq("beneficiary_id", userId)
    .range(from, from + pageSize - 1);
  if (permits.error) {
    throw logger.error("Failed to fetch XP permits from database", { permitsError: permits.error });
  }
  return (permits.data ?? []) as unknown as PermitRow[];
}

function accumulateTotals(rows: PermitRow[], scope: ScopeInfo): { total: Decimal; repo: Decimal; org: Decimal } {
  let total = new Decimal(0);
  let repo = new Decimal(0);
  let org = new Decimal(0);
  for (const row of rows) {
    const amount = typeof row.amount === "string" ? row.amount : "0";
    const decimalAmount = new Decimal(amount);
    total = total.plus(decimalAmount);
    if (!scope.enabled) {
      continue;
    }
    const location = normalizeLocation(row.locations);
    if (scope.repositoryId !== undefined && location?.repository_id === scope.repositoryId) {
      repo = repo.plus(decimalAmount);
    }
    if (scope.organizationId !== undefined && location?.organization_id === scope.organizationId) {
      org = org.plus(decimalAmount);
    }
  }
  return { total, repo, org };
}

async function collectTotals(
  logger: Logger,
  client: SupabaseClient<Database>,
  userId: number,
  scope: ScopeInfo
): Promise<{ total: Decimal; repoTotal: Decimal; orgTotal: Decimal; permitCount: number }> {
  const pageSize = 1000;
  let from = 0;
  let permitCount = 0;
  let total = new Decimal(0);
  let repoTotal = new Decimal(0);
  let orgTotal = new Decimal(0);
  while (true) {
    const rows = await fetchPermitPage(logger, client, userId, from, pageSize, scope.enabled);
    if (rows.length === 0) {
      break;
    }
    const pageTotals = accumulateTotals(rows, scope);
    total = total.plus(pageTotals.total);
    repoTotal = repoTotal.plus(pageTotals.repo);
    orgTotal = orgTotal.plus(pageTotals.org);
    permitCount += rows.length;
    if (rows.length < pageSize) {
      break;
    }
    from += pageSize;
  }
  return { total, repoTotal, orgTotal, permitCount };
}

function buildScope(options?: UserXpScopeOptions): ScopeInfo {
  const repositoryId = typeof options?.repositoryId === "number" ? options.repositoryId : undefined;
  const organizationId = typeof options?.organizationId === "number" ? options.organizationId : undefined;
  return {
    enabled: repositoryId !== undefined || organizationId !== undefined,
    repositoryId,
    organizationId,
  };
}

function buildEmptyTotal(scope: ScopeInfo): UserXpTotal {
  const empty: UserXpTotal = {
    total: 0,
    permitCount: 0,
  };
  if (!scope.enabled) {
    return empty;
  }
  return {
    ...empty,
    scopes: {
      global: 0,
      repo: scope.repositoryId !== undefined ? 0 : undefined,
      org: scope.organizationId !== undefined ? 0 : undefined,
    },
  };
}

function applyScopes(result: UserXpTotal, totals: { repoTotal: Decimal; orgTotal: Decimal }, scope: ScopeInfo): UserXpTotal {
  return {
    ...result,
    scopes: {
      global: result.total,
      repo: scope.repositoryId !== undefined ? totals.repoTotal.div(BASE_UNIT).toNumber() : undefined,
      org: scope.organizationId !== undefined ? totals.orgTotal.div(BASE_UNIT).toNumber() : undefined,
    },
  };
}
