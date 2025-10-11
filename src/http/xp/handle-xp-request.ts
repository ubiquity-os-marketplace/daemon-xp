import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";
import { LOG_LEVEL, Logs } from "@ubiquity-os/ubiquity-os-logger";
import { Database } from "../../adapters/supabase/generated-types";
import { Logger, getUserTotalWithLogger } from "../../adapters/supabase/xp/get-user-total";
import { Env } from "../../types";
import { formatHandle, sanitizeHandle, shouldReturnNoData } from "../../xp/utils";
import { fetchGitHubUser } from "./fetch-github-user";

type XpRequestDependencies = {
  fetchGitHubUser: typeof fetchGitHubUser;
  getUserTotal: typeof getUserTotalWithLogger;
};

let dependencies: XpRequestDependencies = {
  fetchGitHubUser,
  getUserTotal: getUserTotalWithLogger,
};

export function overrideXpRequestDependencies(overrides: Partial<XpRequestDependencies>) {
  dependencies = {
    ...dependencies,
    ...overrides,
  };
}

export function resetXpRequestDependencies() {
  dependencies = {
    fetchGitHubUser,
    getUserTotal: getUserTotalWithLogger,
  };
}

type UserXpSuccess = {
  login: string;
  id: number;
  hasData: true;
  total: number;
  permitCount: number;
};

type UserXpUnavailable = {
  login: string;
  hasData: false;
  message: string;
};

type UserXpResponse = UserXpSuccess | UserXpUnavailable;

type JsonError = {
  error: {
    code: string;
    message: string;
  };
};

export async function handleXpRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return jsonError(405, {
      error: {
        code: "method_not_allowed",
        message: "Only GET requests are supported for this endpoint.",
      },
    });
  }

  const usernames = extractUsernames(new URL(request.url));
  if (usernames.length === 0) {
    return jsonError(400, {
      error: {
        code: "missing_usernames",
        message: "At least one username is required. Provide it using the 'user' query parameter.",
      },
    });
  }

  const logger = createLogger(env);
  const supabase = createSupabaseClient(env);
  const token = env.GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;

  try {
    const users = await Promise.all(usernames.map((username) => resolveUserXp(username, token, supabase, logger)));
    return jsonResponse({ users });
  } catch (err) {
    logger.error("Failed to serve /xp request", { err });
    return jsonError(502, {
      error: {
        code: "upstream_error",
        message: "Unable to complete XP lookup at this time.",
      },
    });
  }
}

async function resolveUserXp(username: string, token: string | undefined, supabase: SupabaseClient<Database>, logger: Logger): Promise<UserXpResponse> {
  const githubUser = await dependencies.fetchGitHubUser(username, token);
  if (!githubUser) {
    return {
      login: username,
      hasData: false,
      message: `I don't have XP data for ${formatHandle(username)} yet.`,
    };
  }
  const total = await dependencies.getUserTotal(logger, supabase, githubUser.id);
  if (shouldReturnNoData(total)) {
    return {
      login: githubUser.login,
      hasData: false,
      message: `I don't have XP data for ${formatHandle(githubUser.login)} yet.`,
    };
  }
  return {
    login: githubUser.login,
    id: githubUser.id,
    hasData: true,
    total: total.total,
    permitCount: total.permitCount,
  };
}

function extractUsernames(url: URL): string[] {
  const collected: string[] = [];
  for (const key of ["user", "username", "login"]) {
    for (const value of url.searchParams.getAll(key)) {
      collected.push(value);
    }
  }
  const usersParam = url.searchParams.get("users");
  if (usersParam) {
    const parsed = tryParseUsersArray(usersParam);
    if (parsed) {
      collected.push(...parsed);
    }
  }
  const sanitized: string[] = [];
  const seen = new Set<string>();
  for (const raw of collected) {
    const clean = sanitizeHandle(raw);
    if (!clean) {
      continue;
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sanitized.push(clean);
  }
  return sanitized;
}

function tryParseUsersArray(value: string): string[] | undefined {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    if (value.includes(",")) {
      return value.split(",").map((item) => item.trim());
    }
  }
  return undefined;
}

function createLogger(env: Env): Logs {
  return new Logs(env.LOG_LEVEL ?? LOG_LEVEL.INFO);
}

function createSupabaseClient(env: Env): SupabaseClient<Database> {
  return createClient<Database>(env.SUPABASE_URL, env.SUPABASE_KEY);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function jsonError(status: number, body: JsonError): Response {
  return jsonResponse(body, status);
}
