import { ContextPlugin } from "../types/index";

export type IssueTimelineEvent = Awaited<ReturnType<ContextPlugin["octokit"]["rest"]["issues"]["listEventsForTimeline"]>>["data"][number];

type TimelineResponse = IssueTimelineEvent[];

export async function getIssueTimeline(context: ContextPlugin<"issues.unassigned">): Promise<TimelineResponse> {
  const ownerLogin = context.payload.repository.owner?.login;
  if (!ownerLogin) {
    throw new Error("Repository owner login is missing from the event payload");
  }
  const repositoryName = context.payload.repository.name;
  if (!repositoryName) {
    throw new Error("Repository name is missing from the event payload");
  }
  const issueNumber = context.payload.issue.number;
  const timeline = await context.octokit.paginate(context.octokit.rest.issues.listEventsForTimeline, {
    owner: ownerLogin,
    repo: repositoryName,
    issue_number: issueNumber,
    mediaType: { previews: ["mockingbird"] },
  });
  return timeline as TimelineResponse;
}
