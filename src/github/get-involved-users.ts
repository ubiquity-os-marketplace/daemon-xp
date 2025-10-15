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
  addParticipant(participants, context.payload.issue.user);
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
    addParticipant(store, comment?.user);
  }
}

function collectParticipantsFromReviews(store: Map<number, InvolvedUser>, reviews: PullRequestReview[]) {
  for (const review of reviews) {
    addParticipant(store, review?.user);
  }
}

function addParticipant(store: Map<number, InvolvedUser>, candidate: { id?: unknown; login?: unknown } | null | undefined) {
  if (!candidate) {
    return;
  }
  const { id, login } = candidate;
  if (typeof id !== "number" || typeof login !== "string" || login.length === 0) {
    return;
  }
  if (store.has(id)) {
    return;
  }
  store.set(id, {
    id,
    login,
  });
}
