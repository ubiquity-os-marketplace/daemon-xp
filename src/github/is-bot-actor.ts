export function isBotActor(actor: { type?: string | null; login?: string | null } | undefined): boolean {
  if (!actor) {
    return false;
  }
  const actorType = typeof actor.type === "string" ? actor.type.toLowerCase() : "";
  return actorType === "bot";
}
