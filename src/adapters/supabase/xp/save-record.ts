import type { SupabaseClient } from "@supabase/supabase-js";
import Decimal from "decimal.js";
import { keccak256, toUtf8Bytes } from "ethers";
import { randomUUID } from "node:crypto";
import { ContextPlugin } from "../../../types/index";
import { SaveXpRecordInput } from "../../../types/supabase";
import { Database, TablesInsert } from "../generated-types";
import { getOrCreateIssueLocation } from "../location/get-or-create-issue-location";
import { BASE_UNIT } from "./get-user-total";

export async function saveXpRecord(context: ContextPlugin, client: SupabaseClient<Database>, input: SaveXpRecordInput): Promise<void> {
  const { userId, issue, numericAmount } = input;
  const targetTable = numericAmount < 0 ? "xp_penalties" : "permits";
  context.logger.info(`Attempting to save XP record for userId: ${userId}, issueId: ${issue.issueId}, amount: ${numericAmount}, table: ${targetTable}`);
  const beneficiaryId = await ensureBeneficiary(context, client, userId);
  const locationId = await getOrCreateIssueLocation(context, client, issue);
  const amountString = new Decimal(numericAmount).mul(BASE_UNIT).toFixed();
  if (targetTable === "permits") {
    await upsertPermitRecord(context, client, {
      beneficiaryId,
      locationId,
      amountString,
      issueId: issue.issueId,
      userId,
    });
    return;
  }
  await upsertPenaltyRecord(context, client, {
    beneficiaryId,
    locationId,
    amountString,
    issueId: issue.issueId,
    userId,
  });
}

type UpsertXpRecordInput = {
  beneficiaryId: number;
  locationId: number;
  amountString: string;
  issueId: number;
  userId: number;
};

async function ensureBeneficiary(context: ContextPlugin, client: SupabaseClient<Database>, userId: number): Promise<number> {
  const userUpsert = await client.from("users").upsert({ id: userId }, { onConflict: "id" }).select("id").single();
  if (userUpsert.error || !userUpsert.data) {
    throw context.logger.error("Failed to ensure user exists in database", { userUpsertError: userUpsert.error });
  }
  context.logger.ok(`User with ID ${userId} is ready in database.`);
  return userUpsert.data.id;
}

async function upsertPermitRecord(context: ContextPlugin, client: SupabaseClient<Database>, input: UpsertXpRecordInput): Promise<void> {
  const { beneficiaryId, locationId, amountString, issueId, userId } = input;
  const permitInsert: TablesInsert<"permits"> = {
    amount: amountString,
    beneficiary_id: beneficiaryId,
    location_id: locationId,
    token_id: null,
    nonce: BigInt(keccak256(toUtf8Bytes(`${userId}-${issueId}`))).toString(),
    deadline: "",
    signature: randomUUID(),
    partner_id: null,
  };
  const permitUpsert = await client.from("permits").upsert(permitInsert, { onConflict: "beneficiary_id,location_id" });
  if (permitUpsert.error) {
    throw context.logger.error("Failed to upsert XP permit into database", { permitUpsertError: permitUpsert.error });
  }
  context.logger.ok(`XP permit upserted successfully for userId: ${userId}, issueId: ${issueId}`);
}

async function upsertPenaltyRecord(context: ContextPlugin, client: SupabaseClient<Database>, input: UpsertXpRecordInput): Promise<void> {
  const { beneficiaryId, locationId, amountString, issueId, userId } = input;
  const penaltyInsert: TablesInsert<"xp_penalties"> = {
    amount: amountString,
    beneficiary_id: beneficiaryId,
    location_id: locationId,
  };
  const penaltyUpsert = await client.from("xp_penalties").upsert(penaltyInsert, { onConflict: "beneficiary_id,location_id" });
  if (penaltyUpsert.error) {
    throw context.logger.error("Failed to upsert XP penalty into database", { penaltyUpsertError: penaltyUpsert.error });
  }
  context.logger.ok(`XP penalty upserted successfully for userId: ${userId}, issueId: ${issueId}`);
}
