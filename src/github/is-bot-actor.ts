export function isBotActor(actor: { type?: string | null; login?: string | null } | undefined): boolean {
  if (!actor) {
    return false;
  }
  const actorType = typeof actor.type === "string" ? actor.type.toLowerCase() : "";
  if (actorType === "bot") {
    return true;
  }
  const login = typeof actor.login === "string" ? actor.login.toLowerCase() : "";
  return login.endsWith("[bot]") || login.includes("-bot") || login.includes("bot");
}
