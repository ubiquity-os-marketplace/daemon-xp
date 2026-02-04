import type { SupabaseClient } from "@supabase/supabase-js";
import { ContextPlugin } from "../../../types/index";
import { IssueLocationInput } from "../../../types/supabase";
import { Database } from "../generated-types";

export async function getOrCreateIssueLocation(context: ContextPlugin, client: SupabaseClient<Database>, issue: IssueLocationInput): Promise<number> {
  const existing = await client.from("locations").select("id,node_url").eq("issue_id", issue.issueId).maybeSingle();
  if (existing.error) {
    throw context.logger.error("Failed to fetch location from database", { locationError: existing.error });
  }
  if (existing.data) {
    if (issue.issueUrl && existing.data.node_url !== issue.issueUrl) {
      const update = await client.from("locations").update({ node_url: issue.issueUrl }).eq("id", existing.data.id);
      if (update.error) {
        throw context.logger.error("Failed to update location node_url", { locationUpdateError: update.error });
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
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    throw context.logger.error("Failed to create location in database", { locationInsertError: inserted.error });
  }
  context.logger.ok(`Created new location for issue ${issue.issueId}`);
  return inserted.data.id;
}
