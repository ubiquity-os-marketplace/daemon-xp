import type { SupabaseClient } from "@supabase/supabase-js";
import Decimal from "decimal.js";
import { keccak256, toUtf8Bytes } from "ethers";
import { randomUUID } from "node:crypto";
import { ContextPlugin } from "../../../types/index";
import { SaveXpRecordInput } from "../../../types/supabase";
import { Database } from "../generated-types";
import { getOrCreateIssueLocation } from "../location/get-or-create-issue-location";
import { BASE_UNIT } from "./get-user-total";

export async function saveXpRecord(context: ContextPlugin, client: SupabaseClient<Database>, input: SaveXpRecordInput): Promise<void> {
  const { userId, issue, numericAmount } = input;
  context.logger.debug(`Attempting to save XP for userId: ${userId}, issueId: ${issue.issueId}, amount: ${numericAmount}`);
  const userLookup = await client.from("users").select("id").eq("id", userId).maybeSingle();
  let beneficiaryId: number;
  if (userLookup.error) {
    throw context.logger.error("Failed to fetch user from database", { userLookupError: userLookup.error });
  }
  if (!userLookup.data) {
    context.logger.info(`User with ID ${userId} not found in database. Attempting to create new user.`);
    const userInsert = await client.from("users").insert({ id: userId }).select("id").single();
    if (userInsert.error || !userInsert.data) {
      throw context.logger.error("Failed to create user in database", { userInsertError: userInsert.error });
    }
    context.logger.info(`Successfully created user with ID ${userId} in database.`);
    beneficiaryId = userInsert.data.id;
  } else {
    beneficiaryId = userLookup.data.id;
  }
  const locationId = await getOrCreateIssueLocation(context, client, issue);
  const amountString = new Decimal(numericAmount).mul(BASE_UNIT).toFixed();
  const permitLookup = await client
    .from("permits")
    .select("id")
    .eq("beneficiary_id", beneficiaryId)
    .eq("location_id", locationId)
    .is("token_id", null)
    .maybeSingle();
  if (permitLookup.error) {
    throw context.logger.error("Error checking for duplicate XP records", { permitLookupError: permitLookup.error });
  }
  if (permitLookup.data) {
    context.logger.debug(`Existing XP record found for userId ${userId} on issue ${issue.issueId}. Updating amount.`);
    const permitUpdate = await client.from("permits").update({ amount: amountString }).eq("id", permitLookup.data.id);
    if (permitUpdate.error) {
      throw context.logger.error("Failed to update XP record in database", { permitUpdateError: permitUpdate.error });
    }
    context.logger.info(`XP record updated successfully for userId: ${userId}, issueId: ${issue.issueId}`);
    return;
  }
  const nonce = BigInt(keccak256(toUtf8Bytes(`${userId}-${issue.issueId}`))).toString();
  const permitInsert = await client.from("permits").insert({
    amount: amountString,
    beneficiary_id: beneficiaryId,
    location_id: locationId,
    token_id: null,
    nonce,
    deadline: "",
    signature: randomUUID(),
    partner_id: null,
  });
  if (permitInsert.error) {
    throw context.logger.error("Failed to insert XP record into database", { permitInsertError: permitInsert.error });
  }
  context.logger.info(`XP record inserted successfully for userId: ${userId}, issueId: ${issue.issueId}`);
}
