/**
 * issue-target resume resolvers.
 *
 * Locates a resumable job from a GitHub issue number by:
 *   1. Scanning issue comments for the latest escalation marker (→ jobId).
 *   2. Listing Development-linked branches and confirming identity via
 *      three-field checkpoint match: jobId / issueNumber / branch name.
 *
 * DSM: domain layer — imports only kernel ports, git layer, state, errors, and logger.
 * This module must not import from the cli or adapter layers (module-boundary TC-001 / B-1).
 */
import type { GitHubClient } from "../../kernel/github-client.js";
import type { SpawnFn } from "../../util/spawn.js";
import { parseEscalationJobId } from "../notify/issue-notifier.js";
import { readStateJsonFromRef } from "../../git/checkpoint-ref.js";
import {
  resumeFromIssueNoMarkerError,
  resumeFromIssueNoLinkError,
  resumeFromIssueUnconfirmedError,
} from "../../errors.js";
import { logWarn } from "../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Narrow locator port (D2)
// ---------------------------------------------------------------------------

/**
 * Minimum GitHub API surface needed for issue-target resume resolution.
 * Does NOT include getIssue — the issue body is never read on this path (D5).
 */
export type IssueResumeClient = Pick<GitHubClient, "listIssueComments"> & {
  listIssueLinkedBranches(owner: string, repo: string, issueNumber: number): Promise<string[]>;
};

// ---------------------------------------------------------------------------
// resolveEscalationJobId
// ---------------------------------------------------------------------------

interface ResolveEscalationInput {
  client: IssueResumeClient;
  owner: string;
  repo: string;
  issueNumber: number;
}

/**
 * Scan issue comments for escalation markers, returning the jobId from the
 * most-recently-created marker.
 *
 * @throws resumeFromIssueNoMarkerError when no escalation marker is found.
 */
export async function resolveEscalationJobId(input: ResolveEscalationInput): Promise<string> {
  const { client, owner, repo, issueNumber } = input;
  // ponytail: full pagination (O(⌈C/100⌉) calls) — the per-issue comments endpoint
  // (GET /repos/{owner}/{repo}/issues/{number}/comments) ignores direction=desc; only
  // the repository-level /issues/comments endpoint supports it. Early exit is therefore
  // not possible. Upgrade path: switch to the repo-level endpoint with direction=desc +
  // issue_number filter if escalation issues ever accumulate > 100 comments.
  const comments = await client.listIssueComments(owner, repo, issueNumber);

  // Collect comments that contain an escalation marker
  const candidates: Array<{ jobId: string; createdAt: string }> = [];
  for (const comment of comments) {
    const jobId = parseEscalationJobId(comment.body);
    if (jobId !== null) {
      candidates.push({ jobId, createdAt: comment.createdAt });
    }
  }

  if (candidates.length === 0) {
    throw resumeFromIssueNoMarkerError(issueNumber);
  }

  // Pick the most recently created escalation marker
  candidates.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return candidates[0]!.jobId;
}

// ---------------------------------------------------------------------------
// resolveResumeBranchFromIssue
// ---------------------------------------------------------------------------

interface ResolveResumeBranchInput {
  client: IssueResumeClient;
  owner: string;
  repo: string;
  issueNumber: number;
  jobId: string;
  spawnFn: SpawnFn;
  cwd: string;
}

interface ResolvedResumeBranch {
  branch: string;
  slug: string;
  checkpointOid: string;
}

/**
 * Lightweight state identity fields parsed from a branch-borne state.json.
 */
interface CheckpointIdentity {
  jobId?: string;
  issueNumber?: number | null;
  branch?: string | null;
  request?: { slug?: string };
}

/**
 * Enumerate Development-linked branches for the issue, fetch each, read the
 * checkpoint, and confirm identity via three-field match:
 *   state.jobId === jobId
 *   state.issueNumber === issueNumber
 *   state.branch === candidateBranch
 *
 * @throws resumeFromIssueNoLinkError   when no linked branches exist.
 * @throws resumeFromIssueUnconfirmedError when zero or multiple branches confirm.
 */
export async function resolveResumeBranchFromIssue(
  input: ResolveResumeBranchInput,
): Promise<ResolvedResumeBranch> {
  const { client, owner, repo, issueNumber, jobId, spawnFn, cwd } = input;

  const linkedBranches = await client.listIssueLinkedBranches(owner, repo, issueNumber);
  if (linkedBranches.length === 0) {
    throw resumeFromIssueNoLinkError(issueNumber);
  }

  const confirmed: ResolvedResumeBranch[] = [];
  const skipped: string[] = [];

  for (const branch of linkedBranches) {
    // Fetch remote-tracking ref
    const fetchResult = await spawnFn("git", ["fetch", "origin", branch], { cwd });
    if (fetchResult.exitCode !== 0) {
      logWarn(`resume-from-issue: skipping branch '${branch}': fetch failed (exit ${fetchResult.exitCode})`);
      skipped.push(branch);
      continue;
    }

    // Resolve the commit OID (TOCTOU-safe: resolved once after fetch)
    const revParseResult = await spawnFn(
      "git",
      ["rev-parse", `origin/${branch}^{commit}`],
      { cwd },
    );
    if (revParseResult.exitCode !== 0) {
      logWarn(`resume-from-issue: skipping branch '${branch}': rev-parse failed`);
      skipped.push(branch);
      continue;
    }
    const checkpointOid = revParseResult.stdout.trim();

    // Read state.json only (lightweight — no events.jsonl, no recursive ls-tree)
    let slug: string;
    let stateJson: string;
    try {
      ({ slug, stateJson } = await readStateJsonFromRef(spawnFn, cwd, checkpointOid));
    } catch (err) {
      logWarn(
        `resume-from-issue: skipping branch '${branch}': cannot read checkpoint: ${(err as Error).message}`,
      );
      skipped.push(branch);
      continue;
    }

    // Lightweight parse — only read identity fields
    let identity: CheckpointIdentity;
    try {
      identity = JSON.parse(stateJson) as CheckpointIdentity;
    } catch {
      logWarn(`resume-from-issue: skipping branch '${branch}': state.json is not valid JSON`);
      skipped.push(branch);
      continue;
    }

    // Three-field identity check (D3)
    if (
      identity.jobId !== jobId ||
      identity.issueNumber !== issueNumber ||
      identity.branch !== branch
    ) {
      skipped.push(branch);
      continue;
    }

    confirmed.push({ branch, slug, checkpointOid });
  }

  if (confirmed.length === 1) {
    return confirmed[0]!;
  }

  if (confirmed.length === 0) {
    const detail =
      skipped.length > 0
        ? `No linked branch passed identity check (jobId=${jobId}, issueNumber=${issueNumber}). Candidates checked: ${linkedBranches.join(", ")}.`
        : `No linked branches matched identity fields (jobId=${jobId}, issueNumber=${issueNumber}).`;
    throw resumeFromIssueUnconfirmedError(detail);
  }

  // Multiple confirmed branches — ambiguous
  throw resumeFromIssueUnconfirmedError(
    `Multiple branches confirmed identity (${confirmed.map((c) => c.branch).join(", ")}). Cannot determine unique target.`,
  );
}
