import type { SupabaseClient } from "@supabase/supabase-js";
import { ContextPlugin } from "../../../types/index";
import { IssueLocationInput } from "../../../types/supabase";
import { Database } from "../generated-types";

export async function getOrCreateIssueLocation(context: ContextPlugin, client: SupabaseClient<Database>, issue: IssueLocationInput): Promise<number> {
  const repositoryId = toFiniteNumber(context.payload.repository?.id);
  const organizationId = toFiniteNumber(context.payload.organization?.id) ?? toFiniteNumber(context.payload.repository?.owner?.id);
  const existing = await client.from("locations").select("id, repository_id, organization_id").eq("issue_id", issue.issueId).maybeSingle();
  if (existing.error) {
    throw context.logger.error("Failed to fetch location from database", { locationError: existing.error });
  }
  if (existing.data) {
    const updates: Partial<Database["public"]["Tables"]["locations"]["Update"]> = {};
    if (repositoryId !== undefined && existing.data.repository_id !== repositoryId) {
      updates.repository_id = repositoryId;
    }
    if (organizationId !== undefined && existing.data.organization_id !== organizationId) {
      updates.organization_id = organizationId;
    }
    if (Object.keys(updates).length > 0) {
      const update = await client.from("locations").update(updates).eq("id", existing.data.id);
      if (update.error) {
        throw context.logger.error("Failed to update location metadata", { locationUpdateError: update.error });
      }
    }
    return existing.data.id;
  }
  const inserted = await client
    .from("locations")
    .insert({
      issue_id: issue.issueId,
      node_type: "Issue",
      node_url: issue.issueUrl,
      repository_id: repositoryId ?? null,
      organization_id: organizationId ?? null,
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    throw context.logger.error("Failed to create location in database", { locationInsertError: inserted.error });
  }
  context.logger.ok(`Created new location for issue ${issue.issueId}`);
  return inserted.data.id;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number") {
    return undefined;
  }
  if (!Number.isFinite(value)) {
    return undefined;
  }
  return value;
}
