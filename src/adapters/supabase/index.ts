import { ContextPlugin } from "../../types";

export class SupabaseAdapter {
  protected context: ContextPlugin;

  constructor(context: ContextPlugin) {
    this.context = context;
  }
}
