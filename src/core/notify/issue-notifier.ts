/**
 * Issue notifier: writes GitHub issue comments on pipeline terminal transitions.
 *
 * Best-effort: comment write failures are logged as warnings and do not affect
 * job state or exit code.
 *
 * DSM: domain layer — imports only core/port, state, and logger (no adapters,
 * no runtime branching).
 */
import type { GitHubClient } from "../port/github-client.js";
import type { JobState } from "../../state/schema.js";
import { logWarn } from "../../logger/stdout.js";
import { getOpenDecisionFindings } from "../decision/decision-ledger.js";

/**
 * Minimum context required to write issue comments.
 * PipelineDeps satisfies this interface structurally.
 */
interface NotifyCtx {
  githubClient: GitHubClient;
  owner: string;
  repo: string;
}

/** The HTML comment prefix used in all specrunner notification comments. */
export const NOTIFICATION_COMMENT_PREFIX = "<!-- specrunner:notification";

/**
 * Returns true if the given comment body is a specrunner notification comment
 * (i.e. contains the notification marker prefix).
 * Used to distinguish bot-generated comments from human comments.
 */
export function isNotificationComment(body: string): boolean {
  return body.includes(NOTIFICATION_COMMENT_PREFIX);
}

/**
 * Returns true if the given comment body contains the escalation marker
 * for the specified jobId.
 *
 * @param body   Comment body to inspect.
 * @param jobId  Job ID to match against the escalation marker.
 */
export function matchesEscalationMarker(body: string, jobId: string): boolean {
  return body.includes(buildMarker("escalation", jobId));
}

/**
 * Build the body for a validation failure (reject) comment on an issue.
 * Includes the notification marker so the bot's comment can be identified
 * and excluded from future inbox scans.
 *
 * @param issueNumber   GitHub issue number (informational only).
 * @param validateError Human-readable validation error message.
 */
export function buildRejectComment(issueNumber: number, validateError: string): string {
  // Use a synthetic jobId-free marker to mark this as a bot notification.
  // We use a fixed placeholder so the comment is identifiable but not job-specific.
  const marker = `${NOTIFICATION_COMMENT_PREFIX} kind="reject" issue="${issueNumber}" version="1" -->`;
  return [
    marker,
    "",
    "Could not start job: request.md validation failed.",
    "",
    `Error: ${validateError}`,
    "",
    "Please fix the issue body to match request.md format and re-apply the approval label.",
  ].join("\n");
}

/**
 * Build the machine-readable HTML comment marker for a notification.
 *
 * Format: `<!-- specrunner:notification kind="<kind>" jobId="<jobId>" version="1" -->`
 *
 * @throws {Error} if jobId contains "-->" (would break the HTML comment boundary).
 */
export function buildMarker(kind: "escalation" | "completed", jobId: string): string {
  if (jobId.includes("-->")) {
    throw new Error(`buildMarker: jobId must not contain "-->" (received: ${JSON.stringify(jobId)})`);
  }
  return `<!-- specrunner:notification kind="${kind}" jobId="${jobId}" version="1" -->`;
}

/**
 * Build a GitHub compare URL for the given repository and branches (pure).
 *
 * Format: `https://github.com/{owner}/{repo}/compare/{base}...{branch}`
 * Values are inserted verbatim; no percent-encoding is applied
 * (branch names are system-generated and contain only URL-safe characters).
 */
export function buildCompareUrl(owner: string, repo: string, base: string, branch: string): string {
  return `https://github.com/${owner}/${repo}/compare/${base}...${branch}`;
}

/**
 * Escape a plain-text value for safe inclusion in a GitHub markdown comment.
 *
 * Prevents model-controlled text from introducing:
 * - HTML tags (< and >)
 * - Line breaks that could start a new /resume-style instruction
 * - HTML entity injection via &
 *
 * Note: This does not escape Markdown emphasis (* _ ` etc.) to keep the
 * output readable; those characters are acceptable in rendered comment bodies.
 * The primary risk — multi-line injection via \n — is addressed by flattening.
 */
function escapePlainText(text: string): string {
  return String(text)
    .replace(/\r?\n/g, " ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build the escalation comment body (pure).
 * Includes: marker, stopped step, resume reason, compare URL (when branch is set),
 * open decision options (when present), and resume command.
 */
export function buildEscalationComment(state: JobState): string {
  const marker = buildMarker("escalation", state.jobId);
  const slug = state.request.slug ?? null;
  const step = state.resumePoint?.step ?? "(unknown)";
  const reason = state.resumePoint?.reason ?? "(no reason recorded)";
  const resumeCmd = slug
    ? `specrunner job resume ${slug}`
    : "specrunner job resume <slug>";

  const lines: string[] = [
    marker,
    "",
    "Job stopped (awaiting-resume)",
    "",
    `Step: ${step}`,
    `Reason: ${reason}`,
    "",
  ];

  if (state.branch) {
    const base = state.request.baseBranch ?? "main";
    const url = buildCompareUrl(state.repository.owner, state.repository.name, base, state.branch);
    lines.push(`Diff: ${url}`);
    lines.push("");
  }

  // Render open decision-needed findings and their options (D5)
  const openFindings = getOpenDecisionFindings(state);
  const findingsWithOptions = openFindings.filter(
    (f) => f.options && f.options.length >= 2,
  );

  if (findingsWithOptions.length > 0) {
    lines.push("Decisions needed:");
    lines.push("");

    const exampleParts: string[] = [];

    findingsWithOptions.forEach((finding, findingIdx) => {
      const findingNum = findingIdx + 1;
      const locationSuffix = finding.line !== undefined
        ? ` (${escapePlainText(finding.file)}:${finding.line})`
        : ` (${escapePlainText(finding.file)})`;
      lines.push(`${findingNum}. ${escapePlainText(finding.title)}${locationSuffix}`);
      lines.push(`   ${escapePlainText(finding.rationale)}`);

      finding.options!.forEach((opt, optIdx) => {
        const optNum = optIdx + 1;
        lines.push(`   ${optNum}. ${escapePlainText(opt.label)} — Consequence: ${escapePlainText(opt.consequence)}`);
      });

      // Use the first option as the example selection (1-indexed)
      exampleParts.push(`${findingNum}=1`);
      lines.push("");
    });

    lines.push("Reply with:");
    lines.push(`  /resume ${exampleParts.join(" ")}`);
    lines.push("");
  }

  lines.push("To resume:");
  lines.push(`  ${resumeCmd}`);

  return lines.join("\n");
}

/**
 * Build the completion comment body (pure).
 * Includes: marker, PR URL (if available), and archive command.
 */
export function buildCompletionComment(state: JobState): string {
  const marker = buildMarker("completed", state.jobId);
  const slug = state.request.slug ?? null;
  const prUrl = state.pullRequest?.url ?? null;
  const archiveCmd = slug
    ? `specrunner job archive ${slug}`
    : "specrunner job archive <slug>";

  const lines: string[] = [
    marker,
    "",
    "Job completed (awaiting-archive)",
    "",
  ];

  if (prUrl) {
    lines.push(`PR: ${prUrl}`);
    lines.push("");
  } else {
    lines.push("(PR URL not recorded)");
    lines.push("");
  }

  lines.push("To archive:");
  lines.push(`  ${archiveCmd}`);

  return lines.join("\n");
}

/**
 * Write a terminal notification to the linked GitHub issue.
 *
 * - If `state.issueNumber` is absent (undefined / null): returns immediately, no API call.
 * - If `state.status` is `awaiting-resume`: writes escalation comment.
 * - If `state.status` is `awaiting-archive`: writes completion comment.
 * - Any other status: returns immediately (no-op).
 * - Comment write failures are caught and logged as warnings; never re-thrown.
 */
export async function notifyJobTerminal(state: JobState, ctx: NotifyCtx): Promise<void> {
  if (state.issueNumber == null) {
    return;
  }

  let body: string;
  if (state.status === "awaiting-resume") {
    body = buildEscalationComment(state);
  } else if (state.status === "awaiting-archive") {
    body = buildCompletionComment(state);
  } else {
    return;
  }

  try {
    await ctx.githubClient.createIssueComment(ctx.owner, ctx.repo, state.issueNumber, body);
  } catch (err) {
    logWarn(
      `issue-notifier: failed to write comment to issue #${state.issueNumber}: ${(err as Error).message ?? String(err)}`,
    );
  }
}
