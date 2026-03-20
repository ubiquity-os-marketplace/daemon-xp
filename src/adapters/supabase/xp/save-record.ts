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
  const userLookup = await client.from("users").select("id").eq("id", userId).maybeSingle();
  if (userLookup.error) {
    throw context.logger.error("Failed to fetch user from database", { userLookupError: userLookup.error });
  }
  if (userLookup.data) {
    return userLookup.data.id;
  }
  context.logger.info(`User with ID ${userId} not found in database. Attempting to create new user.`);
  const userInsert = await client.from("users").insert({ id: userId }).select("id").single();
  if (userInsert.error || !userInsert.data) {
    throw context.logger.error("Failed to create user in database", { userInsertError: userInsert.error });
  }
  context.logger.ok(`Successfully created user with ID ${userId} in database.`);
  return userInsert.data.id;
}

async function upsertPermitRecord(context: ContextPlugin, client: SupabaseClient<Database>, input: UpsertXpRecordInput): Promise<void> {
  const { beneficiaryId, locationId, amountString, issueId, userId } = input;
  const permitLookup = await client
    .from("permits")
    .select("id")
    .eq("beneficiary_id", beneficiaryId)
    .eq("location_id", locationId)
    .is("token_id", null)
    .maybeSingle();
  if (permitLookup.error) {
    throw context.logger.error("Error checking for duplicate XP permit records", { permitLookupError: permitLookup.error });
  }
  if (permitLookup.data) {
    context.logger.debug(`Existing XP permit found for userId ${userId} on issue ${issueId}. Updating amount.`);
    const permitUpdate = await client.from("permits").update({ amount: amountString }).eq("id", permitLookup.data.id);
    if (permitUpdate.error) {
      throw context.logger.error("Failed to update XP permit in database", { permitUpdateError: permitUpdate.error });
    }
    context.logger.ok(`XP permit updated successfully for userId: ${userId}, issueId: ${issueId}`);
    return;
  }
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
  const insertResult = await client.from("permits").insert(permitInsert);
  if (insertResult.error) {
    throw context.logger.error("Failed to insert XP permit into database", { permitInsertError: insertResult.error });
  }
  context.logger.ok(`XP permit inserted successfully for userId: ${userId}, issueId: ${issueId}`);
}

async function upsertPenaltyRecord(context: ContextPlugin, client: SupabaseClient<Database>, input: UpsertXpRecordInput): Promise<void> {
  const { beneficiaryId, locationId, amountString, issueId, userId } = input;
  const penaltyLookup = await client.from("xp_penalties").select("id").eq("beneficiary_id", beneficiaryId).eq("location_id", locationId).maybeSingle();
  if (penaltyLookup.error) {
    throw context.logger.error("Error checking for duplicate XP penalty records", { penaltyLookupError: penaltyLookup.error });
  }
  if (penaltyLookup.data) {
    context.logger.debug(`Existing XP penalty found for userId ${userId} on issue ${issueId}. Updating amount.`);
    const penaltyUpdate = await client.from("xp_penalties").update({ amount: amountString }).eq("id", penaltyLookup.data.id);
    if (penaltyUpdate.error) {
      throw context.logger.error("Failed to update XP penalty in database", { penaltyUpdateError: penaltyUpdate.error });
    }
    context.logger.ok(`XP penalty updated successfully for userId: ${userId}, issueId: ${issueId}`);
    return;
  }
  const penaltyInsert: TablesInsert<"xp_penalties"> = {
    amount: amountString,
    beneficiary_id: beneficiaryId,
    location_id: locationId,
  };
  const insertResult = await client.from("xp_penalties").insert(penaltyInsert);
  if (insertResult.error) {
    throw context.logger.error("Failed to insert XP penalty into database", { penaltyInsertError: insertResult.error });
  }
  context.logger.ok(`XP penalty inserted successfully for userId: ${userId}, issueId: ${issueId}`);
}
