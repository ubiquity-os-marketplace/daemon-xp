import { IssueTimelineEvent } from "./get-issue-timeline";
import { isBotActor } from "./is-bot-actor";

const DISQUALIFIER_MARKER = "@ubiquity-os/daemon-disqualifier";
const COMMENT_EVENT_NAMES = new Set(["commented", "timeline_comment"]);
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

type TimelineComment = IssueTimelineEvent & {
  created_at?: string;
  body?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  actor?: { type?: string | null; login?: string | null } | null;
};

export function findLatestDisqualifierComment(events: IssueTimelineEvent[], unassignmentDate: Date, windowMs = DEFAULT_WINDOW_MS): TimelineComment | null {
  if (!Number.isFinite(unassignmentDate.getTime())) {
    return null;
  }
  let latest: TimelineComment | null = null;
  let latestTimestamp = -Infinity;
  for (const event of events) {
    if (!isComment(event)) {
      continue;
    }
    if (!containsMarker(event)) {
      continue;
    }
    if (!isBotActor(event.actor ?? undefined)) {
      continue;
    }
    const createdAt = parseTimestamp(event.created_at);
    if (!createdAt) {
      continue;
    }
    const timeDiff = unassignmentDate.getTime() - createdAt.getTime();
    if (timeDiff < 0 || timeDiff > windowMs) {
      continue;
    }
    const timestamp = createdAt.getTime();
    if (!latest || timestamp > latestTimestamp) {
      latest = event;
      latestTimestamp = timestamp;
    }
  }
  return latest;
}

function isComment(event: IssueTimelineEvent): event is TimelineComment {
  if (!event || typeof event !== "object") {
    return false;
  }
  const candidate = event as { event?: unknown };
  const name = typeof candidate.event === "string" ? candidate.event.toLowerCase() : "";
  return COMMENT_EVENT_NAMES.has(name);
}

function containsMarker(event: TimelineComment): boolean {
  const candidates = [event.body, event.body_text, event.body_html];
  for (const value of candidates) {
    if (typeof value === "string" && value.includes(DISQUALIFIER_MARKER)) {
      return true;
    }
  }
  return false;
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return date;
}
