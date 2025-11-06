import { IssueTimelineEvent } from "./get-issue-timeline";

export function findLatestUnassignmentEvent(events: IssueTimelineEvent[], assigneeId: number): IssueTimelineEvent | null {
  let latest: IssueTimelineEvent | null = null;
  for (const event of events) {
    if (event.event !== "unassigned") {
      continue;
    }
    if (!("assignee" in event) || !event.assignee || typeof event.assignee.id !== "number") {
      continue;
    }
    if (event.assignee.id !== assigneeId) {
      continue;
    }
    if (!("created_at" in event) || !event.created_at) {
      continue;
    }
    if (!latest) {
      latest = event;
      continue;
    }
    const currentTimestamp = new Date(event.created_at).getTime();
    const latestTimestamp = new Date((latest as IssueTimelineEvent & { created_at: string }).created_at).getTime();
    if (currentTimestamp >= latestTimestamp) {
      latest = event;
    }
  }
  return latest;
}
