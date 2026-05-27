/**
 * Input resolution for finish command.
 * Resolves target job via <slug> positional / --pr / --job / cwd auto-detect.
 *
 * Priority: slug → --pr → --job → auto-detect
 *
 * TC-109: --pr <num> → getPullRequest → headRefName → stripBranchPrefix → slug
 * TC-130: specrunner finish <slug> resolves state
 * TC-131: no slug specified → escalation (exit 2)
 * TC-134: multiple states for same slug → latest updatedAt chosen
 */
import { JobStateStore } from "../../store/job-state-store.js";
import { getJobSlug, stripBranchPrefix, stripJobIdSuffix } from "../../state/job-slug.js";
import type { JobState } from "../../state/schema.js";
import type { ResolvedTarget } from "./types.js";
import type { GitHubClient } from "../../core/port/github-client.js";
import { logResult } from "../../logger/stdout.js";

export interface ResolveTargetInput {
  /** Positional <slug> argument (first priority). */
  slug?: string;
  /** --pr <num>: reverse lookup via REST API. */
  prNumber?: number;
  /** --job <jobId>: direct job ID lookup (forensics / debug). */
  jobId?: string;
  /** Base directory for active detection (defaults to cwd). */
  cwd?: string;
  /** GitHub REST API client (required for --pr resolution). */
  githubClient?: GitHubClient;
  /** GitHub repository owner (required for --pr resolution). */
  owner?: string;
  /** GitHub repository name (required for --pr resolution). */
  repo?: string;
}

export type ResolveTargetResult =
  | { ok: true; target: ResolvedTarget }
  | { ok: false; exitCode: 2; message: string };

/**
 * Resolve the finish target from the given inputs.
 * Priority: slug → --pr → --job → active auto-detect.
 */
export async function resolveTarget(
  input: ResolveTargetInput,
  stdoutWrite: (msg: string) => void = logResult,
): Promise<ResolveTargetResult> {
  const repoRoot = input.cwd ?? process.cwd();

  // 1. Positional <slug> resolution
  if (input.slug) {
    return resolveBySlug(input.slug, repoRoot, stdoutWrite);
  }

  // 2. --pr <num> reverse lookup
  if (input.prNumber !== undefined && input.githubClient && input.owner && input.repo) {
    return resolveByPrNumber(input.prNumber, input.githubClient, input.owner, input.repo, repoRoot, stdoutWrite);
  }

  // 3. --job <jobId> direct lookup (forensics / debug)
  if (input.jobId) {
    return resolveByJobId(input.jobId, repoRoot, stdoutWrite);
  }

  // 4. active dir auto-detection
  return resolveByAutoDetect(repoRoot, stdoutWrite);
}

/**
 * Resolve by slug: find matching jobs via getJobSlug.
 */
async function resolveBySlug(
  slug: string,
  repoRoot: string,
  stdoutWrite: (msg: string) => void,
): Promise<ResolveTargetResult> {
  const allStates = await JobStateStore.list(repoRoot);
  const matching = allStates.filter((s) => getJobSlug(s) === slug);

  if (matching.length === 0) {
    return {
      ok: false,
      exitCode: 2,
      message: `No job found with slug '${slug}'. Run 'specrunner ps' to see available jobs.`,
    };
  }

  let chosen = matching[0]!;

  if (matching.length > 1) {
    // TC-134: Pick latest updatedAt
    matching.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    chosen = matching[0]!;
    stdoutWrite(
      `Multiple states found for slug ${slug}, using most recent (updatedAt: ${chosen.updatedAt})`,
    );
  }

  return buildResolvedTarget(chosen, slug);
}

/**
 * Resolve by --pr <num>: REST API getPullRequest → headRefName → stripBranchPrefix → slug.
 *
 * TC-109: --pr 48 → headRefName feat/readme-status-section → readme-status-section
 */
async function resolveByPrNumber(
  prNumber: number,
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  repoRoot: string,
  stdoutWrite: (msg: string) => void,
): Promise<ResolveTargetResult> {
  let prData: { headRefName?: string };
  try {
    prData = await githubClient.getPullRequest(owner, repo, prNumber);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      exitCode: 2,
      message: `Failed to resolve PR #${prNumber}: ${detail}. Run 'specrunner login'.`,
    };
  }

  const headRef = prData.headRefName ?? "";
  const slug = stripJobIdSuffix(stripBranchPrefix(headRef));

  if (!slug) {
    return {
      ok: false,
      exitCode: 2,
      message: `Could not derive slug from headRefName '${headRef}' for PR #${prNumber}.`,
    };
  }

  return resolveBySlug(slug, repoRoot, stdoutWrite);
}

/**
 * Resolve by --job <jobId>: direct load.
 */
async function resolveByJobId(
  jobId: string,
  repoRoot: string,
  _stdoutWrite: (msg: string) => void,
): Promise<ResolveTargetResult> {
  try {
    const state = (await new JobStateStore(jobId, repoRoot).load()) as JobState;
    const slug = getJobSlug(state);
    return buildResolvedTarget(state, slug);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, exitCode: 2, message };
  }
}

/**
 * Auto-detect: no longer supported. Returns error immediately.
 *
 * TC-131: no slug specified → escalation (exit 2)
 */
async function resolveByAutoDetect(
  _cwd: string,
  _stdoutWrite: (msg: string) => void,
): Promise<ResolveTargetResult> {
  return {
    ok: false,
    exitCode: 2,
    message: "No slug specified. Specify <slug>, --pr, or --job.",
  };
}

/**
 * Build a ResolvedTarget from a loaded JobState.
 * Returns exitCode 2 if the state is missing PR or branch info.
 */
function buildResolvedTarget(
  state: JobState,
  slug: string,
): ResolveTargetResult {
  const prNumber = state.pullRequest?.number;
  const prUrl = state.pullRequest?.url;
  const branch = state.branch;

  if (!prNumber || !prUrl || !branch) {
    return {
      ok: false,
      exitCode: 2,
      message: `Job ${state.jobId} is missing pullRequest or branch info. Was the pr-create step completed?`,
    };
  }

  return {
    ok: true,
    target: {
      jobId: state.jobId,
      prNumber,
      prUrl,
      branch,
      slug,
      worktreePath: state.worktreePath ?? null,
    },
  };
}
