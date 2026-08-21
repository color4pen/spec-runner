/**
 * issue-target archive resolvers.
 *
 * Locates an archivable job from a GitHub issue number by:
 *   1. Scanning issue comments for the latest completed marker (→ jobId).
 *   2. Listing closing PR references and confirming identity via
 *      four-field checkpoint match: jobId / issueNumber / branch / pullRequest.number.
 *
 * DSM: domain layer — imports only kernel ports, git layer, state, errors, and logger.
 * This module must not import from the cli or adapter layers.
 */
import type { GitHubClient } from "../../kernel/github-client.js";
import type { SpawnFn } from "../../util/spawn.js";
import { parseCompletedJobId } from "../notify/issue-notifier.js";
import { readStateJsonFromRef } from "../../git/checkpoint-ref.js";
import {
  archiveFromIssueNoMarkerError,
  archiveFromIssueNoPrError,
  archiveFromIssueUnconfirmedError,
} from "../../errors.js";
import { logWarn } from "../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Narrow client port
// ---------------------------------------------------------------------------

/**
 * Minimum GitHub API surface needed for issue-target archive resolution.
 */
export type IssueArchiveClient = Pick<GitHubClient, "listIssueComments"> & {
  listIssueClosingPullRequests(owner: string, repo: string, issueNumber: number): Promise<Array<{ number: number; headRefName: string }>>;
};

// ---------------------------------------------------------------------------
// resolveCompletedJobId
// ---------------------------------------------------------------------------

interface ResolveCompletedInput {
  client: IssueArchiveClient;
  owner: string;
  repo: string;
  issueNumber: number;
}

/**
 * Scan issue comments for completed markers, returning the jobId from the
 * most-recently-created marker.
 *
 * Escalation markers are ignored — only `kind="completed"` markers count.
 *
 * @throws archiveFromIssueNoMarkerError when no completed marker is found.
 */
export async function resolveCompletedJobId(input: ResolveCompletedInput): Promise<string> {
  const { client, owner, repo, issueNumber } = input;
  const comments = await client.listIssueComments(owner, repo, issueNumber);

  const candidates: Array<{ jobId: string; createdAt: string }> = [];
  for (const comment of comments) {
    const jobId = parseCompletedJobId(comment.body);
    if (jobId !== null) {
      candidates.push({ jobId, createdAt: comment.createdAt });
    }
  }

  if (candidates.length === 0) {
    throw archiveFromIssueNoMarkerError(issueNumber);
  }

  // Pick the most recently created completed marker
  candidates.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return candidates[0]!.jobId;
}

// ---------------------------------------------------------------------------
// resolveArchiveBranchFromIssue (4-field identity match)
// ---------------------------------------------------------------------------

interface ResolveArchiveBranchInput {
  client: IssueArchiveClient;
  owner: string;
  repo: string;
  issueNumber: number;
  jobId: string;
  spawnFn: SpawnFn;
  cwd: string;
}

interface ResolvedArchiveBranch {
  branch: string;
  slug: string;
  checkpointOid: string;
}

/**
 * Lightweight state identity fields parsed from a branch-borne state.json.
 * Includes pullRequest for the 4th identity field.
 */
interface ArchiveCheckpointIdentity {
  jobId?: string;
  issueNumber?: number | null;
  branch?: string | null;
  request?: { slug?: string };
  pullRequest?: { number?: number };
}

/**
 * Enumerate closing PRs for the issue, fetch each PR's head branch, read the
 * checkpoint, and confirm identity via four-field match:
 *   state.jobId === jobId
 *   state.issueNumber === issueNumber
 *   state.branch === headRefName
 *   state.pullRequest.number === PR.number
 *
 * @throws archiveFromIssueNoPrError   when no closing PRs exist.
 * @throws archiveFromIssueUnconfirmedError when zero or multiple branches confirm.
 */
export async function resolveArchiveBranchFromIssue(
  input: ResolveArchiveBranchInput,
): Promise<ResolvedArchiveBranch> {
  const { client, owner, repo, issueNumber, jobId, spawnFn, cwd } = input;

  const closingPRs = await client.listIssueClosingPullRequests(owner, repo, issueNumber);
  if (closingPRs.length === 0) {
    throw archiveFromIssueNoPrError(issueNumber);
  }

  const confirmed: ResolvedArchiveBranch[] = [];

  for (const pr of closingPRs) {
    const { number: prNumber, headRefName: branch } = pr;

    // Fetch remote-tracking ref
    const fetchResult = await spawnFn("git", ["fetch", "origin", branch], { cwd });
    if (fetchResult.exitCode !== 0) {
      logWarn(`archive-from-issue: skipping PR #${prNumber} (branch '${branch}'): fetch failed (exit ${fetchResult.exitCode})`);
      continue;
    }

    // Resolve the commit OID (TOCTOU-safe: resolved once after fetch)
    const revParseResult = await spawnFn(
      "git",
      ["rev-parse", `origin/${branch}^{commit}`],
      { cwd },
    );
    if (revParseResult.exitCode !== 0) {
      logWarn(`archive-from-issue: skipping PR #${prNumber} (branch '${branch}'): rev-parse failed`);
      continue;
    }
    const checkpointOid = revParseResult.stdout.trim();

    // Read state.json only (lightweight)
    let slug: string;
    let stateJson: string;
    try {
      ({ slug, stateJson } = await readStateJsonFromRef(spawnFn, cwd, checkpointOid));
    } catch (err) {
      logWarn(
        `archive-from-issue: skipping PR #${prNumber} (branch '${branch}'): cannot read checkpoint: ${(err as Error).message}`,
      );
      continue;
    }

    // Lightweight parse — only read identity fields
    let identity: ArchiveCheckpointIdentity;
    try {
      identity = JSON.parse(stateJson) as ArchiveCheckpointIdentity;
    } catch {
      logWarn(`archive-from-issue: skipping PR #${prNumber} (branch '${branch}'): state.json is not valid JSON`);
      continue;
    }

    // Four-field identity check
    if (
      identity.jobId !== jobId ||
      identity.issueNumber !== issueNumber ||
      identity.branch !== branch ||
      identity.pullRequest?.number !== prNumber
    ) {
      logWarn(
        `archive-from-issue: skipping PR #${prNumber} (branch '${branch}'): 4-field identity mismatch ` +
        `(jobId=${identity.jobId}, issueNumber=${identity.issueNumber}, branch=${identity.branch}, prNumber=${identity.pullRequest?.number})`,
      );
      continue;
    }

    confirmed.push({ branch, slug, checkpointOid });
  }

  if (confirmed.length === 1) {
    return confirmed[0]!;
  }

  if (confirmed.length === 0) {
    throw archiveFromIssueUnconfirmedError(
      `No closing PR passed 4-field identity check (jobId=${jobId}, issueNumber=${issueNumber}). ` +
      `Candidates checked: ${closingPRs.map((p) => `#${p.number}(${p.headRefName})`).join(", ")}.`,
    );
  }

  throw archiveFromIssueUnconfirmedError(
    `Multiple PRs confirmed identity (${confirmed.map((c) => c.branch).join(", ")}). Cannot determine unique target.`,
  );
}
