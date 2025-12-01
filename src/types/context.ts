import { Context as PluginContext } from "@ubiquity-os/plugin-sdk";
import { Command } from "./command";
import { Env } from "./env";
import { PluginSettings } from "./plugin-input";
import { SupabaseAdapterContract } from "./supabase";

/**
 * Update `manifest.json` with any events you want to support like so:
 *
 * ubiquity:listeners: ["issue_comment.created", ...]
 */
export type SupportedEvents = "issues.unassigned" | "issue_comment.created" | "pull_request_review_comment.created" | "pull_request_review.submitted";

export type ContextPlugin<T extends SupportedEvents = SupportedEvents> = PluginContext<PluginSettings, Env, Command, T> & {
  adapters: {
    supabase: SupabaseAdapterContract;
  };
};
