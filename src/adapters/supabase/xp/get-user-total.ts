import type { SupabaseClient } from "@supabase/supabase-js";
import Decimal from "decimal.js";
import { ContextPlugin } from "../../../types/index";
import { UserXpTotal } from "../../../types/supabase";
import { Database } from "../generated-types";

const BASE_UNIT = new Decimal(10).pow(18);

export type Logger = Pick<ContextPlugin["logger"], "info" | "ok" | "error">;

export async function getUserTotal(context: ContextPlugin, client: SupabaseClient<Database>, userId: number): Promise<UserXpTotal> {
  return fetchUserTotal(context.logger, client, userId);
}

export async function getUserTotalWithLogger(logger: Logger, client: SupabaseClient<Database>, userId: number): Promise<UserXpTotal> {
  return fetchUserTotal(logger, client, userId);
}

async function fetchUserTotal(logger: Logger, client: SupabaseClient<Database>, userId: number): Promise<UserXpTotal> {
  logger.info(`Fetching XP permits for userId: ${userId}`);
  const pageSize = 1000;
  let from = 0;
  let permitCount = 0;
  let total = new Decimal(0);
  while (true) {
    const permits = await client
      .from("permits" as never)
      .select("amount")
      .eq("beneficiary_id", userId)
      .not("token_id", "is", null)
      .range(from, from + pageSize - 1);
    if (permits.error) {
      throw logger.error("Failed to fetch XP permits from database", { permitsError: permits.error });
    }
    const rows = (permits.data ?? []) as { amount: string | null }[];
    if (rows.length === 0) {
      break;
    }
    for (const row of rows) {
      const amount = typeof row.amount === "string" ? row.amount : "0";
      total = total.plus(new Decimal(amount));
    }
    permitCount += rows.length;
    if (rows.length < pageSize) {
      break;
    }
    from += pageSize;
  }
  if (permitCount === 0) {
    logger.info(`No XP permits found for userId: ${userId}`);
    return {
      total: 0,
      permitCount: 0,
    };
  }
  const normalized = total.div(BASE_UNIT);
  logger.ok(`XP permits fetched successfully for userId: ${userId}`);
  return {
    total: normalized.toNumber(),
    permitCount,
  };
}
