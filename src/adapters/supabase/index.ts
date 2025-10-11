import type { SupabaseClient } from "@supabase/supabase-js";
import { ContextPlugin } from "../../types";
import { IssueLocationInput, SaveXpRecordInput } from "../../types/supabase";
import { Database } from "./generated-types";
import { getOrCreateIssueLocation } from "./location/get-or-create-issue-location";
import { getUserTotal } from "./xp/get-user-total";
import { saveXpRecord } from "./xp/save-record";

export class SupabaseAdapter {
  constructor(
    private readonly _context: ContextPlugin,
    private readonly _client: SupabaseClient<Database>
  ) {}

  readonly location = {
    getOrCreateIssueLocation: (issue: IssueLocationInput) => getOrCreateIssueLocation(this._context, this._client, issue),
  };

  readonly xp = {
    saveRecord: (input: SaveXpRecordInput) => saveXpRecord(this._context, this._client, input),
    getUserTotal: (userId: number) => getUserTotal(this._context, this._client, userId),
  };
}
