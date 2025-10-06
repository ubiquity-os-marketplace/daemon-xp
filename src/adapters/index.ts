import { SupabaseClient } from "@supabase/supabase-js";
import { ContextPlugin } from "../types";
import { SupabaseAdapter } from "./supabase";
import { Database } from "./supabase/generated-types";

export function createAdapters(supabaseClient: SupabaseClient<Database>, context: ContextPlugin) {
  return {
    supabase: new SupabaseAdapter(context, supabaseClient),
  };
}

export * from "./supabase";
