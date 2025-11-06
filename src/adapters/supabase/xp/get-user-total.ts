import type { SupabaseClient } from "@supabase/supabase-js";
import { Logs } from "@ubiquity-os/ubiquity-os-logger";
import Decimal from "decimal.js";
import { UserXpTotal } from "../../../types/supabase";
import { Database } from "../generated-types";

export const BASE_UNIT = new Decimal(10).pow(18);

type Logger = Pick<Logs, "info" | "debug" | "error">;

export async function fetchUserTotal(logger: Logger, client: SupabaseClient<Database>, userId: number): Promise<UserXpTotal> {
  logger.debug(`Fetching XP permits for userId: ${userId}`);
  const pageSize = 1000;
  let from = 0;
  let permitCount = 0;
  let total = new Decimal(0);
  while (true) {
    const permits = await client
      .from("permits")
      .select("amount")
      .eq("beneficiary_id", userId)
      .range(from, from + pageSize - 1);
    if (permits.error) {
      throw logger.error("Failed to fetch XP permits from database", { permitsError: permits.error });
    }
    const rows = permits.data ?? [];
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
  logger.debug(`XP permits fetched successfully for userId: ${userId}`);
  return {
    total: normalized.toNumber(),
    permitCount,
  };
}
