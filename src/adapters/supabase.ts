import { Context } from "node:vm";

export class SupabaseAdapter {
  protected context: Context;

  constructor(context: Context) {
    this.context = context;
  }
}
