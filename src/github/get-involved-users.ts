import { ContextPlugin } from "../types/index";

export type InvolvedUser = {
  id: number;
  login: string;
};

type IssueComment = Awaited<ReturnType<ContextPlugin["octokit"]["rest"]["issues"]["listComments"]>>["data"][number];
type PullRequestReview = Awaited<ReturnType<ContextPlugin["octokit"]["rest"]["pulls"]["listReviews"]>>["data"][number];

export async function getInvolvedUsers(context: ContextPlugin<"issues.unassigned">): Promise<InvolvedUser[]> {
  const ownerLogin = context.payload.repository.owner?.login;
  const repositoryName = context.payload.repository.name;
  const issueNumber = context.payload.issue.number;
  if (!ownerLogin || !repositoryName || !Number.isFinite(issueNumber)) {
    return [];
  }
  const participants = new Map<number, InvolvedUser>();
  const comments = await context.octokit.paginate(context.octokit.rest.issues.listComments, {
    owner: ownerLogin,
    repo: repositoryName,
    issue_number: issueNumber,
    per_page: 100,
  });
  collectParticipantsFromComments(participants, comments as IssueComment[]);
  if ("pull_request" in context.payload.issue && context.payload.issue.pull_request) {
    const reviews = await context.octokit.paginate(context.octokit.rest.pulls.listReviews, {
      owner: ownerLogin,
      repo: repositoryName,
      pull_number: issueNumber,
      per_page: 100,
    });
    collectParticipantsFromReviews(participants, reviews as PullRequestReview[]);
  }
  return Array.from(participants.values());
}

function collectParticipantsFromComments(store: Map<number, InvolvedUser>, comments: IssueComment[]) {
  for (const comment of comments) {
    const user = comment?.user;
    if (!user) {
      continue;
    }
    if (typeof user.id !== "number" || typeof user.login !== "string") {
      continue;
    }
    if (user.login.length === 0) {
      continue;
    }
    if (store.has(user.id)) {
      continue;
    }
    store.set(user.id, {
      id: user.id,
      login: user.login,
    });
  }
}

function collectParticipantsFromReviews(store: Map<number, InvolvedUser>, reviews: PullRequestReview[]) {
  for (const review of reviews) {
    const user = review?.user;
    if (!user) {
      continue;
    }
    if (typeof user.id !== "number" || typeof user.login !== "string") {
      continue;
    }
    if (user.login.length === 0) {
      continue;
    }
    if (store.has(user.id)) {
      continue;
    }
    store.set(user.id, {
      id: user.id,
      login: user.login,
    });
  }
}
