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
  const permits = await client.from("permits").select("amount").eq("beneficiary_id", userId).not("token_id", "is", null);
  if (permits.error) {
    throw logger.error("Failed to fetch XP permits from database", { permitsError: permits.error });
  }
  const rows = permits.data ?? [];
  if (rows.length === 0) {
    logger.info(`No XP permits found for userId: ${userId}`);
    return {
      total: 0,
      permitCount: 0,
    };
  }
  const total = rows.reduce((acc, row) => {
    const amount = typeof row.amount === "string" ? row.amount : "0";
    return acc.plus(new Decimal(amount));
  }, new Decimal(0));
  const normalized = total.div(BASE_UNIT);
  logger.ok(`XP permits fetched successfully for userId: ${userId}`);
  return {
    total: normalized.toNumber(),
    permitCount: rows.length,
  };
}
