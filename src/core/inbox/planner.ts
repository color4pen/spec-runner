/**
 * Inbox planner: pure functions for determining which jobs to start, reject, or resume.
 *
 * No I/O. All decisions are deterministic given their inputs.
 */
import type { JobState, DecisionRecord } from "../../state/schema.js";
import { isNotificationComment, matchesEscalationMarker } from "../notify/issue-notifier.js";
import { parseRequestMdContent } from "../../parser/request-md.js";
import { getJobSlug } from "../../state/job-slug.js";
import { computeFindingKey, getOpenDecisionFindings } from "../decision/decision-ledger.js";
import type { IssueRef, IssueComment, StartAction, RejectAction, ResumeAction, RecoverAction, EscalateAction, InboxPlan } from "./types.js";

export type { IssueRef, IssueComment, StartAction, RejectAction, ResumeAction, RecoverAction, EscalateAction, InboxPlan };

/** Maximum consecutive auto-recovery attempts before crash-loop escalation. */
export const MAX_STALE_RECOVERY_ATTEMPTS = 3;

/**
 * Count total step-run executions across all steps in a job state.
 * Returns the sum of all StepRun array lengths (steps undefined → 0).
 */
export function countStepRuns(state: JobState): number {
  return Object.values(state.steps ?? {}).reduce((n, runs) => n + runs.length, 0);
}

/**
 * Plan recover / escalate actions for stale-running jobs.
 *
 * Pure function — no I/O, no process.kill, no fs access.
 * Precondition: every job in staleJobs has status === "running".
 *
 * @param staleJobs   Jobs already confirmed to be stale-running (process dead).
 * @param maxAttempts Maximum consecutive auto-recovery attempts (default MAX_STALE_RECOVERY_ATTEMPTS).
 */
export function planStaleRecoveries(
  staleJobs: JobState[],
  maxAttempts = MAX_STALE_RECOVERY_ATTEMPTS,
): { recovers: RecoverAction[]; escalates: EscalateAction[] } {
  const recovers: RecoverAction[] = [];
  const escalates: EscalateAction[] = [];

  for (const job of staleJobs) {
    const slug = getJobSlug(job);
    if (!slug) continue;

    const currentCount = countStepRuns(job);
    const stored = job.staleRecovery ?? null;
    // Reset attempt counter when there has been progress since last recovery
    const effective =
      stored && stored.stepCount === currentCount ? stored.attempts : 0;

    if (effective >= maxAttempts) {
      escalates.push({
        kind: "escalate",
        slug,
        jobId: job.jobId,
        issueNumber: job.issueNumber,
        step: job.step,
      });
    } else {
      recovers.push({
        kind: "recover",
        slug,
        jobId: job.jobId,
        issueNumber: job.issueNumber,
        staleRecovery: { attempts: effective + 1, stepCount: currentCount },
      });
    }
  }

  return { recovers, escalates };
}

/**
 * Author associations that are allowed to trigger /resume.
 */
const ALLOWED_AUTHOR_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/**
 * Returns true if the latest notification comment on the issue is a reject for that issue.
 * Used to suppress duplicate reject comments (dedup).
 *
 * @param comments     All comments on the issue, in any order.
 * @param issueNumber  The issue number to match in the reject marker.
 */
function hasLatestRejectNotification(comments: IssueComment[], issueNumber: number): boolean {
  let latest: IssueComment | null = null;
  for (const comment of comments) {
    if (!isNotificationComment(comment.body)) continue;
    if (latest === null || comment.createdAt > latest.createdAt) {
      latest = comment;
    }
  }
  if (latest === null) return false;
  return latest.body.includes(`kind="reject" issue="${issueNumber}"`);
}

/**
 * Plan start/reject actions for approved issues.
 *
 * - Issues already linked to any job (any status) are skipped.
 * - Remaining issues are validated as request.md content.
 * - Valid issues → StartAction (up to maxStarts).
 * - Invalid issues → RejectAction (no limit), unless the latest notification comment
 *   is already a reject for this issue (dedup).
 *
 * @param approvedIssues   Issues with the approval label.
 * @param jobStates        All known job states (used to find already-linked issues).
 * @param maxStarts        Maximum number of StartActions to return (0 = no starts).
 * @param commentsByIssue  Optional map of issueNumber → comments for reject dedup.
 */
export function planStarts(
  approvedIssues: IssueRef[],
  jobStates: JobState[],
  maxStarts: number,
  commentsByIssue?: Map<number, IssueComment[]>,
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
      // Dedup: skip if the latest notification comment is already a reject for this issue
      if (commentsByIssue) {
        const comments = commentsByIssue.get(issue.number) ?? [];
        if (hasLatestRejectNotification(comments, issue.number)) continue;
      }
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
      const parsed = parseResumeDecisionInput(bestCandidate.body);

      if (parsed.selections.length > 0) {
        // Structured selection path: validate against open decisions
        const openFindings = getOpenDecisionFindings(job);
        const findingsWithOptions = openFindings.filter(
          (f) => f.options && f.options.length >= 2,
        );

        if (findingsWithOptions.length === 0) {
          // No open decisions with options — treat selections as prose (pass through)
          resumes.push({
            kind: "resume",
            slug: job.request.slug,
            jobId: job.jobId,
            issueNumber: job.issueNumber,
            resumePrompt: parseResumePrompt(bestCandidate.body),
          });
        } else {
          // Validate: all open findings must be covered exactly once, options must be valid
          const decisionRecords = resolveDecisions(
            parsed.selections,
            findingsWithOptions,
            job,
            bestCandidate.body,
          );
          if (decisionRecords !== null) {
            resumes.push({
              kind: "resume",
              slug: job.request.slug,
              jobId: job.jobId,
              issueNumber: job.issueNumber,
              resumePrompt: parsed.resumePrompt,
              decisions: decisionRecords,
            });
          }
          // If decisionRecords is null, selections were invalid — skip this comment
          // (job remains awaiting-resume, user can provide a corrected /resume)
        }
      } else {
        // Prose-only resume — always allowed
        resumes.push({
          kind: "resume",
          slug: job.request.slug,
          jobId: job.jobId,
          issueNumber: job.issueNumber,
          resumePrompt: parsed.resumePrompt,
        });
      }
    }
  }

  return resumes;
}

/**
 * Resolve structured decision selections into DecisionRecord entries.
 * Returns null when selections are invalid (wrong range, duplicates, or incomplete coverage).
 *
 * Validation rules:
 * - Every finding number N must be in range [1, openFindings.length]
 * - Every option number M must be in range [1, finding.options.length]
 * - No duplicate finding numbers
 * - All open findings must have exactly one selection
 */
function resolveDecisions(
  selections: ResumeDecisionSelection[],
  openFindings: import("../../kernel/report-result.js").Finding[],
  job: JobState,
  rawComment: string,
): DecisionRecord[] | null {
  const step = job.resumePoint?.step ?? job.step;

  // Check for duplicates
  const seenFindingNumbers = new Set<number>();
  for (const sel of selections) {
    if (seenFindingNumbers.has(sel.findingNumber)) return null;
    seenFindingNumbers.add(sel.findingNumber);
  }

  // Check all open findings are covered
  if (selections.length !== openFindings.length) return null;

  // Validate each selection and build records
  const records: DecisionRecord[] = [];
  const decidedAt = new Date().toISOString();

  for (const sel of selections) {
    if (sel.findingNumber < 1 || sel.findingNumber > openFindings.length) return null;
    const finding = openFindings[sel.findingNumber - 1]!;
    const options = finding.options ?? [];
    if (sel.optionNumber < 1 || sel.optionNumber > options.length) return null;
    const selectedOpt = options[sel.optionNumber - 1]!;

    const findingKey = computeFindingKey(step, finding);
    const id = `decision-${decidedAt}-${sel.findingNumber}`;

    records.push({
      id,
      step,
      findingKey,
      finding: {
        title: finding.title,
        file: finding.file,
        line: finding.line,
        rationale: finding.rationale,
        severity: finding.severity,
        options: finding.options,
      },
      selectedOption: {
        number: sel.optionNumber,
        label: selectedOpt.label,
        consequence: selectedOpt.consequence,
      },
      resumeComment: rawComment,
      decidedAt,
      source: "issue-comment",
    });
  }

  return records;
}

/**
 * A single selection from a /resume N=M token.
 */
export interface ResumeDecisionSelection {
  /** 1-based index of the finding within the rendered decision list. */
  findingNumber: number;
  /** 1-based index of the selected option within the finding's options array. */
  optionNumber: number;
}

/**
 * Result of parsing a /resume comment body for decision selections and prose.
 */
export interface ParsedResumeInput {
  /** Structured N=M selections extracted from the leading token sequence. */
  selections: ResumeDecisionSelection[];
  /** Remaining prose after stripping /resume and any leading N=M tokens. Null if empty. */
  resumePrompt: string | null;
}

/**
 * Parse a /resume comment body for decision selections and prose supplement.
 *
 * Selection tokens are `N=M` words at the start of the remainder after `/resume`,
 * where N and M are positive integers (1-based). Tokens are consumed left-to-right
 * and stop at the first word that is not an `N=M` token. Everything remaining is prose.
 *
 * Invalid N=M tokens (N=0 or M=0) are not treated as selection tokens.
 *
 * @example
 * parseResumeDecisionInput("/resume")              → { selections: [], resumePrompt: null }
 * parseResumeDecisionInput("/resume fix it")       → { selections: [], resumePrompt: "fix it" }
 * parseResumeDecisionInput("/resume 1=2 2=1 note") → { selections: [{findingNumber:1,optionNumber:2},{findingNumber:2,optionNumber:1}], resumePrompt: "note" }
 */
export function parseResumeDecisionInput(body: string): ParsedResumeInput {
  const trimmed = body.trimStart();
  const withoutCommand = trimmed.replace(/^\/resume/, "").trim();

  const parts = withoutCommand.split(/\s+/).filter((p) => p.length > 0);
  const selections: ResumeDecisionSelection[] = [];
  const proseParts: string[] = [];

  let inTokens = true;
  for (const part of parts) {
    if (inTokens && /^\d+=\d+$/.test(part)) {
      const eqIdx = part.indexOf("=");
      const n = parseInt(part.slice(0, eqIdx), 10);
      const m = parseInt(part.slice(eqIdx + 1), 10);
      if (n > 0 && m > 0) {
        selections.push({ findingNumber: n, optionNumber: m });
        continue;
      }
      // n=0 or m=0 → invalid token, treat as prose and stop token scanning
      inTokens = false;
      proseParts.push(part);
    } else {
      inTokens = false;
      proseParts.push(part);
    }
  }

  return {
    selections,
    resumePrompt: proseParts.length > 0 ? proseParts.join(" ") : null,
  };
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
 * Compose planStarts, planResumes, and planStaleRecoveries into a single InboxPlan.
 */
export function planInbox(input: {
  approvedIssues: IssueRef[];
  jobStates: JobState[];
  maxStarts: number;
  commentsByIssue: Map<number, IssueComment[]>;
  /** Set of jobIds confirmed to be stale-running (process dead). Defaults to empty set. */
  staleRunningJobIds?: Set<string>;
}): InboxPlan {
  const { starts, rejects } = planStarts(
    input.approvedIssues,
    input.jobStates,
    input.maxStarts,
    input.commentsByIssue,
  );

  const awaitingJobs = input.jobStates.filter(
    (s) => s.status === "awaiting-resume" && s.issueNumber != null,
  );

  const resumes = planResumes(awaitingJobs, input.commentsByIssue);

  const staleRunningJobIds = input.staleRunningJobIds ?? new Set<string>();
  const staleJobs = input.jobStates.filter(
    (s) => s.status === "running" && staleRunningJobIds.has(s.jobId),
  );
  const { recovers, escalates } = planStaleRecoveries(staleJobs);

  return { starts, rejects, resumes, recovers, escalates };
}
