/**
 * Inbox planner: pure functions for determining which jobs to start, reject, or resume.
 *
 * No I/O. All decisions are deterministic given their inputs.
 */
import type { JobState } from "../../state/schema.js";
import { isNotificationComment, matchesEscalationMarker } from "../notify/issue-notifier.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import type { IssueRef, IssueComment, StartAction, RejectAction, ResumeAction, InboxPlan } from "./types.js";

export type { IssueRef, IssueComment, StartAction, RejectAction, ResumeAction, InboxPlan };

/**
 * Author associations that are allowed to trigger /resume.
 */
const ALLOWED_AUTHOR_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * Plan start/reject actions for approved issues.
 *
 * - Issues already linked to any job (any status) are skipped.
 * - Remaining issues are validated as request.md content.
 * - Valid issues → StartAction (up to maxStarts).
 * - Invalid issues → RejectAction (no limit).
 *
 * @param approvedIssues  Issues with the approval label.
 * @param jobStates       All known job states (used to find already-linked issues).
 * @param maxStarts       Maximum number of StartActions to return (0 = no starts).
 */
export function planStarts(
  approvedIssues: IssueRef[],
  jobStates: JobState[],
  maxStarts: number,
): { starts: StartAction[]; rejects: RejectAction[] } {
  // Build set of issue numbers already linked to any job
  const linkedIssueNumbers = new Set<number>();
  for (const state of jobStates) {
    if (state.issueNumber != null) {
      linkedIssueNumbers.add(state.issueNumber);
    }
  }

  const starts: StartAction[] = [];
  const rejects: RejectAction[] = [];

  for (const issue of approvedIssues) {
    // Skip already-linked issues (idempotency)
    if (linkedIssueNumbers.has(issue.number)) continue;

    // Validate as request.md content
    let slug: string;
    try {
      const parsed = parseRequestMdContent(issue.body, `issue#${issue.number}`);
      slug = parsed.slug;
    } catch (err) {
      rejects.push({
        kind: "reject",
        issue,
        reason: (err as Error).message,
      });
      continue;
    }

    // Only start up to maxStarts (rejects are not limited)
    if (starts.length < maxStarts) {
      starts.push({ kind: "start", issue, slug });
    }
  }

  return { starts, rejects };
}

/**
 * Plan resume actions for awaiting-resume jobs that have qualifying /resume comments.
 *
 * For each awaiting-resume job with an issue link:
 *   - Find the latest escalation marker comment (the cutoff).
 *   - Find comments after the cutoff that are:
 *     - Not bot notification comments
 *     - From a collaborator or above (OWNER/MEMBER/COLLABORATOR)
 *     - Start with "/resume" (followed by end-of-line or whitespace)
 *   - If any qualify, use the latest one as the resumePrompt source.
 *
 * @param awaitingJobs    Jobs with status "awaiting-resume" and a linked issue.
 * @param commentsByIssue Map of issueNumber → comments.
 */
export function planResumes(
  awaitingJobs: JobState[],
  commentsByIssue: Map<number, IssueComment[]>,
): ResumeAction[] {
  const resumes: ResumeAction[] = [];

  for (const job of awaitingJobs) {
    if (job.issueNumber == null) continue;
    if (!job.request.slug) continue;

    const comments = commentsByIssue.get(job.issueNumber) ?? [];

    // Find the latest escalation marker timestamp (cutoff)
    let cutoff: string | null = null;
    for (const comment of comments) {
      if (matchesEscalationMarker(comment.body, job.jobId)) {
        if (cutoff === null || comment.createdAt > cutoff) {
          cutoff = comment.createdAt;
        }
      }
    }

    // If no escalation marker found, skip (safe: we don't know what was seen)
    if (cutoff === null) continue;

    // Find qualifying /resume comments after cutoff
    let bestCandidate: IssueComment | null = null;
    for (const comment of comments) {
      // Must be after the cutoff
      if (comment.createdAt <= cutoff) continue;
      // Must not be a bot notification comment
      if (isNotificationComment(comment.body)) continue;
      // Must be from an authorized author
      if (!ALLOWED_AUTHOR_ASSOCIATIONS.has(comment.authorAssociation)) continue;
      // Must start with "/resume" (with optional trailing whitespace or newline)
      if (!/^\/resume(\s|$)/.test(comment.body.trimStart())) continue;

      // Pick the latest qualifying comment
      if (bestCandidate === null || comment.createdAt > bestCandidate.createdAt) {
        bestCandidate = comment;
      }
    }

    if (bestCandidate !== null) {
      resumes.push({
        kind: "resume",
        slug: job.request.slug,
        jobId: job.jobId,
        issueNumber: job.issueNumber,
        resumePrompt: parseResumePrompt(bestCandidate.body),
      });
    }
  }

  return resumes;
}

/**
 * Extract the resume prompt text from a /resume comment body.
 * Strips the leading "/resume" token and trims the rest.
 * Returns null if the remaining text is empty.
 *
 * @example
 * parseResumePrompt("/resume")         → null
 * parseResumePrompt("/resume fix it")  → "fix it"
 * parseResumePrompt("/resume\nhello")  → "hello"
 */
export function parseResumePrompt(body: string): string | null {
  const trimmed = body.trimStart();
  // Remove the leading /resume token (case-sensitive)
  const withoutCommand = trimmed.replace(/^\/resume/, "").trim();
  return withoutCommand.length > 0 ? withoutCommand : null;
}

/**
 * Compose planStarts and planResumes into a single InboxPlan.
 */
export function planInbox(input: {
  approvedIssues: IssueRef[];
  jobStates: JobState[];
  maxStarts: number;
  commentsByIssue: Map<number, IssueComment[]>;
}): InboxPlan {
  const { starts, rejects } = planStarts(
    input.approvedIssues,
    input.jobStates,
    input.maxStarts,
  );

  const awaitingJobs = input.jobStates.filter(
    (s) => s.status === "awaiting-resume" && s.issueNumber != null,
  );

  const resumes = planResumes(awaitingJobs, input.commentsByIssue);

  return { starts, rejects, resumes };
}
