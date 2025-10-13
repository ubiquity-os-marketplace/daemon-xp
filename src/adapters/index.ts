import type { SupabaseClient } from "@supabase/supabase-js";
import { ContextPlugin } from "../types";
import { SupabaseAdapter } from "./supabase/index";
import { Database } from "./supabase/generated-types";

export function createAdapters(supabaseClient: SupabaseClient<Database>, context: ContextPlugin) {
  return {
    supabase: new SupabaseAdapter(context, supabaseClient),
  };
}
