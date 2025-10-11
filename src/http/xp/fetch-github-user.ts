export type GitHubUserSummary = {
  id: number;
  login: string;
};

export async function fetchGitHubUser(login: string, token?: string): Promise<GitHubUserSummary | null> {
  const response = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ubiquity-os-daemon-xp",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const detail = await safeReadText(response);
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`GitHub user lookup failed with status ${response.status}${suffix}`);
  }

  const data = (await response.json()) as { id?: number; login?: string };
  if (typeof data.id !== "number" || typeof data.login !== "string") {
    throw new Error("GitHub user lookup returned unexpected payload");
  }

  return {
    id: data.id,
    login: data.login,
  };
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    const text = await response.text();
    return text.trim().length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}
