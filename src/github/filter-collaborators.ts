import { ContextPlugin } from "../types/index";
import { InvolvedUser } from "./get-involved-users";

export type CollaboratorInfo = InvolvedUser;

const COLLABORATOR_PERMISSIONS = new Set(["admin", "maintain", "write", "triage"]);

export async function filterCollaborators(context: ContextPlugin<"issues.unassigned">, users: InvolvedUser[]): Promise<CollaboratorInfo[]> {
  if (users.length === 0) {
    return [];
  }
  const ownerLogin = context.payload.repository.owner?.login;
  const repositoryName = context.payload.repository.name;
  const organizationLogin = context.payload.organization?.login ?? ownerLogin;
  if (!ownerLogin || !repositoryName) {
    return [];
  }
  const results: CollaboratorInfo[] = [];
  for (const user of users) {
    if (!user.login) {
      continue;
    }
    const isOrgCollaborator = await isOrganizationCollaborator(context, organizationLogin, user.login);
    if (isOrgCollaborator) {
      results.push(user);
      continue;
    }
    const hasRepoPermissions = await hasElevatedRepositoryPermissions(context, ownerLogin, repositoryName, user.login);
    if (hasRepoPermissions) {
      results.push(user);
    }
  }
  return results;
}

async function isOrganizationCollaborator(context: ContextPlugin, organizationLogin: string | undefined, username: string): Promise<boolean> {
  if (!organizationLogin) {
    return false;
  }
  try {
    const membership = await context.octokit.rest.orgs.getMembershipForUser({
      org: organizationLogin,
      username,
    });
    const role = membership?.data?.role;
    const state = membership?.data?.state;
    if (state !== "active") {
      return false;
    }
    return role === "admin" || role === "member" || role === "billing_manager";
  } catch (error) {
    const status = extractStatusCode(error);
    if (status === 404 || status === 302 || status === 403) {
      return false;
    }
    throw context.logger.error("Failed to check organization membership", {
      err: error,
      organizationLogin,
      username,
    });
  }
}

async function hasElevatedRepositoryPermissions(context: ContextPlugin, ownerLogin: string, repositoryName: string, username: string): Promise<boolean> {
  try {
    const response = await context.octokit.rest.repos.getCollaboratorPermissionLevel({
      owner: ownerLogin,
      repo: repositoryName,
      username,
    });
    const permission = response?.data?.permission;
    if (!permission) {
      return false;
    }
    return COLLABORATOR_PERMISSIONS.has(permission.toLowerCase());
  } catch (error) {
    const status = extractStatusCode(error);
    if (status === 404 || status === 302 || status === 403) {
      return false;
    }
    throw context.logger.error("Failed to check repository collaborator permissions", {
      err: error,
      ownerLogin,
      repositoryName,
      username,
    });
  }
}

function extractStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const status = (error as { status?: number }).status;
  return typeof status === "number" ? status : undefined;
}
