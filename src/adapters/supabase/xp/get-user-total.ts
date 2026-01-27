import type { SupabaseClient } from "@supabase/supabase-js";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import Decimal from "decimal.js";
import { UserXpScopeOptions, UserXpTotal } from "../../../types/supabase";
import { Database } from "../generated-types";

export const BASE_UNIT = new Decimal(10).pow(18);

type Logger = Pick<Logs, "info" | "debug" | "ok" | "error">;

type PermitLocation = {
  node_url: string | null;
};

type PermitRow = {
  amount: string | null;
  locations?: PermitLocation | PermitLocation[] | null;
};

type ScopeInfo = {
  enabled: boolean;
  repositoryFullName?: string;
  organizationLogin?: string;
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

function normalizeLocation(location: PermitRow["locations"]): PermitLocation[] {
  if (!location) {
    return [];
  }
  return Array.isArray(location) ? location.filter(Boolean) : [location];
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
    .select(includeScopeData ? "amount,locations(node_url)" : "amount")
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
    const parsedLocations = normalizeLocation(row.locations)
      .map((loc) => parseLocationScope(loc.node_url))
      .filter(Boolean) as ParsedLocationScope[];
    if (scope.repositoryFullName && parsedLocations.some((loc) => loc.repositoryFullName === scope.repositoryFullName)) {
      repo = repo.plus(decimalAmount);
    }
    if (scope.organizationLogin && parsedLocations.some((loc) => loc.ownerLogin === scope.organizationLogin)) {
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
  const repositoryOwner = toLowerNonEmptyString(options?.repositoryOwner);
  const repositoryName = toLowerNonEmptyString(options?.repositoryName);
  const repositoryFullName = repositoryOwner && repositoryName ? `${repositoryOwner}/${repositoryName}` : undefined;
  const organizationLogin = toLowerNonEmptyString(options?.organizationLogin);
  return {
    enabled: repositoryFullName !== undefined || organizationLogin !== undefined,
    repositoryFullName,
    organizationLogin,
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
      repo: scope.repositoryFullName !== undefined ? 0 : undefined,
      org: scope.organizationLogin !== undefined ? 0 : undefined,
    },
  };
}

function applyScopes(result: UserXpTotal, totals: { repoTotal: Decimal; orgTotal: Decimal }, scope: ScopeInfo): UserXpTotal {
  return {
    ...result,
    scopes: {
      global: result.total,
      repo: scope.repositoryFullName !== undefined ? totals.repoTotal.div(BASE_UNIT).toNumber() : undefined,
      org: scope.organizationLogin !== undefined ? totals.orgTotal.div(BASE_UNIT).toNumber() : undefined,
    },
  };
}

type ParsedLocationScope = {
  ownerLogin: string;
  repositoryName: string;
  repositoryFullName: string;
};

function parseLocationScope(nodeUrl: string | null | undefined): ParsedLocationScope | undefined {
  if (!nodeUrl) {
    return undefined;
  }
  try {
    const url = new URL(nodeUrl);
    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    if (segments.length < 2) {
      return undefined;
    }
    let owner = segments[0];
    let repo = segments[1];
    if (segments[0] === "repos" && segments.length >= 3) {
      owner = segments[1];
      repo = segments[2];
    }
    const ownerLogin = owner.toLowerCase();
    const repositoryName = repo.toLowerCase();
    return {
      ownerLogin,
      repositoryName,
      repositoryFullName: `${ownerLogin}/${repositoryName}`,
    };
  } catch {
    return undefined;
  }
}

function toLowerNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  return trimmed.toLowerCase();
}
