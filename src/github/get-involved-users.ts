import { ContextPlugin } from "../types/index";
import { PullRequest, Repository, User } from "@octokit/graphql-schema";

export type InvolvedUser = {
  id: number;
  login: string;
};

type IssueComment = Awaited<ReturnType<ContextPlugin["octokit"]["rest"]["issues"]["listComments"]>>["data"][number];
type PullRequestReview = Awaited<ReturnType<ContextPlugin["octokit"]["rest"]["pulls"]["listReviews"]>>["data"][number];
type PullRequestReviewComment = Awaited<ReturnType<ContextPlugin["octokit"]["rest"]["pulls"]["listReviewComments"]>>["data"][number];

export const LINKED_PULL_REQUESTS = /* GraphQL */ `
  query collectLinkedPullRequests($owner: String!, $repo: String!, $issue_number: Int!, $include_closed_prs: Boolean = false, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issue_number) {
        id
        closedByPullRequestsReferences(first: 10, includeClosedPrs: $include_closed_prs, after: $cursor) {
          edges {
            node {
              id
              title
              number
              url
              state
              author {
                login
                ... on User {
                  id: databaseId
                }
              }
              repository {
                owner {
                  login
                }
                name
              }
              labels(first: 100) {
                nodes {
                  id
                  name
                  description
                }
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`;

export type ClosedByPullRequestsReferences = {
  node: Pick<PullRequest, "url" | "title" | "number" | "state" | "body"> & {
    author: Pick<User, "login" | "id">;
    repository: Pick<Repository, "owner" | "name">;
    labels?: {
      nodes: {
        name: string;
        description: string;
      }[];
    };
  };
};

type IssueWithClosedByPrs = {
  repository: {
    issue: {
      closedByPullRequestsReferences: {
        edges: ClosedByPullRequestsReferences[];
      };
    };
  };
};

export async function collectLinkedPulls(context: ContextPlugin, issue: { owner: string; repo: string; issue_number: number }, includeClosed: boolean = false) {
  const { octokit } = context;
  const { owner, repo, issue_number } = issue;

  const result = await octokit.graphql.paginate<IssueWithClosedByPrs>(LINKED_PULL_REQUESTS, {
    owner,
    repo,
    issue_number,
    $include_closed_prs: includeClosed,
  });

  return result.repository.issue.closedByPullRequestsReferences.edges.map((edge) => edge.node);
}

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
  const linkedPullRequests = await collectLinkedPulls(context, { owner: ownerLogin, repo: repositoryName, issue_number: issueNumber });
  for (const pullRequest of linkedPullRequests) {
    const comments = await context.octokit.paginate(context.octokit.rest.issues.listComments, {
      owner: ownerLogin,
      repo: repositoryName,
      issue_number: pullRequest.number,
      per_page: 100,
    });
    collectParticipantsFromComments(participants, comments as IssueComment[]);
    const reviews = await context.octokit.paginate(context.octokit.rest.pulls.listReviews, {
      owner: ownerLogin,
      repo: repositoryName,
      pull_number: pullRequest.number,
      per_page: 100,
    });
    collectParticipantsFromReviews(participants, reviews as PullRequestReview[]);
    const reviewComments = await context.octokit.paginate(context.octokit.rest.pulls.listReviewComments, {
      owner: ownerLogin,
      repo: repositoryName,
      pull_number: pullRequest.number,
      per_page: 100,
    });
    collectParticipantsFromReviewComments(participants, reviewComments as PullRequestReviewComment[]);
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

function collectParticipantsFromReviewComments(store: Map<number, InvolvedUser>, reviewComments: PullRequestReviewComment[]) {
  for (const reviewComment of reviewComments) {
    addParticipant(store, reviewComment?.user);
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
