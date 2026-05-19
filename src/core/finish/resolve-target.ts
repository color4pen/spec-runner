/**
 * Input resolution for finish command.
 * Resolves target job via <slug> positional / --pr / --job / cwd auto-detect.
 *
 * Priority: slug → --pr → --job → auto-detect
 *
 * TC-109: --pr <num> → getPullRequest → headRefName → stripBranchPrefix → slug
 * TC-130: specrunner finish <slug> resolves state
 * TC-131: active 0 entries → escalation (exit 2)
 * TC-132: active 2+ entries → escalation (exit 2)
 * TC-133: cwd under active/<dir>/ → auto-detect
 * TC-134: multiple states for same slug → latest updatedAt chosen
 */
import * as path from "node:path";
import { listJobStates, loadJobState } from "../../state/store.js";
import { getJobSlug, stripBranchPrefix, stripJobIdSuffix } from "../../state/job-slug.js";
import type { ResolvedTarget } from "./types.js";
import type { GitHubClient } from "../../core/port/github-client.js";

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
  stdoutWrite: (msg: string) => void = (m) => process.stdout.write(m + "\n"),
): Promise<ResolveTargetResult> {
  // 1. Positional <slug> resolution
  if (input.slug) {
    return resolveBySlug(input.slug, input.cwd, stdoutWrite);
  }

  // 2. --pr <num> reverse lookup
  if (input.prNumber !== undefined && input.githubClient && input.owner && input.repo) {
    return resolveByPrNumber(input.prNumber, input.githubClient, input.owner, input.repo, stdoutWrite);
  }

  // 3. --job <jobId> direct lookup (forensics / debug)
  if (input.jobId) {
    return resolveByJobId(input.jobId, stdoutWrite);
  }

  // 4. active dir auto-detection
  return resolveByAutoDetect(input.cwd ?? process.cwd(), stdoutWrite);
}

/**
 * Resolve by slug: find matching jobs via getJobSlug.
 */
async function resolveBySlug(
  slug: string,
  cwd: string | undefined,
  stdoutWrite: (msg: string) => void,
): Promise<ResolveTargetResult> {
  const allStates = await listJobStates();
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

  return buildResolvedTarget(chosen, slug, cwd);
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

  return resolveBySlug(slug, undefined, stdoutWrite);
}

/**
 * Resolve by --job <jobId>: direct load.
 */
async function resolveByJobId(
  jobId: string,
  _stdoutWrite: (msg: string) => void,
): Promise<ResolveTargetResult> {
  try {
    const state = await loadJobState(jobId);
    const slug = getJobSlug(state);
    return buildResolvedTarget(state, slug, undefined);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, exitCode: 2, message };
  }
}

/**
 * Auto-detect from active directory.
 *
 * TC-131: 0 entries → escalation
 * TC-132: 2+ entries → escalation
 * TC-133: cwd under active/<dir>/ → auto-detect
 */
async function resolveByAutoDetect(
  cwd: string,
  stdoutWrite: (msg: string) => void,
): Promise<ResolveTargetResult> {
  // TC-133: cwd itself is under active/<dir>/
  const cwdSlug = detectSlugFromCwd(cwd);
  if (cwdSlug) {
    stdoutWrite(`Auto-detected slug from cwd: ${cwdSlug}`);
    return resolveBySlug(cwdSlug, cwd, stdoutWrite);
  }

  const activeDir = path.join(cwd, "specrunner", "requests", "active");

  let entries: string[];
  try {
    const { readdir } = await import("node:fs/promises");
    const dirents = await readdir(activeDir, { withFileTypes: true });
    entries = dirents.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      entries = [];
    } else {
      throw err;
    }
  }

  if (entries.length === 0) {
    return {
      ok: false,
      exitCode: 2,
      message: "No request found in active/. Specify <slug>, --pr, or --job.",
    };
  }

  if (entries.length > 1) {
    return {
      ok: false,
      exitCode: 2,
      message: `Multiple slugs in active/: ${entries.join(", ")}. Specify <slug>, --pr, or --job.`,
    };
  }

  // Exactly 1 slug — auto-detect
  const autoSlug = entries[0]!;
  stdoutWrite(`Auto-detected active slug: ${autoSlug}`);

  return resolveBySlug(autoSlug, cwd, stdoutWrite);
}

/**
 * Detect slug from cwd if it's under specrunner/requests/active/<slug>/.
 */
function detectSlugFromCwd(cwd: string): string | null {
  const PATTERN = /specrunner\/requests\/active\/([^/]+)(?:\/|$)/;
  const m = PATTERN.exec(cwd.replace(/\\/g, "/"));
  return m ? (m[1] ?? null) : null;
}

/**
 * Build a ResolvedTarget from a loaded JobState.
 * Returns exitCode 2 if the state is missing PR or branch info.
 */
function buildResolvedTarget(
  state: import("../../state/schema.js").JobState,
  slug: string,
  _cwd: string | undefined,
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
