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

/**
 * Minimum context required to write issue comments.
 * PipelineDeps satisfies this interface structurally.
 */
interface NotifyCtx {
  githubClient: GitHubClient;
  owner: string;
  repo: string;
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
 * Build the escalation comment body (pure).
 * Includes: marker, stopped step, resume reason, and resume command.
 */
export function buildEscalationComment(state: JobState): string {
  const marker = buildMarker("escalation", state.jobId);
  const slug = state.request.slug ?? null;
  const step = state.resumePoint?.step ?? "(unknown)";
  const reason = state.resumePoint?.reason ?? "(no reason recorded)";
  const resumeCmd = slug
    ? `specrunner job resume ${slug}`
    : "specrunner job resume <slug>";

  return [
    marker,
    "",
    "Job stopped (awaiting-resume)",
    "",
    `Step: ${step}`,
    `Reason: ${reason}`,
    "",
    "To resume:",
    `  ${resumeCmd}`,
  ].join("\n");
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
