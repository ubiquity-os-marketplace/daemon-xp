import type { SupabaseClient } from "@supabase/supabase-js";
import { ContextPlugin } from "../types/index";
import { Database } from "./supabase/generated-types";
import { SupabaseAdapter } from "./supabase/index";

export function createAdapters(supabaseClient: SupabaseClient<Database>, context: ContextPlugin) {
  return {
    supabase: new SupabaseAdapter(context, supabaseClient),
  };
}
