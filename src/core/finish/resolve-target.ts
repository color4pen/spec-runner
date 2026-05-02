/**
 * Input resolution for finish command.
 * Resolves target job via <slug> positional / --pr / --job / cwd auto-detect.
 *
 * Priority: slug → --pr → --job → auto-detect
 *
 * TC-109: --pr <num> → gh pr view → headRefName → stripBranchPrefix → slug
 * TC-130: specrunner finish <slug> resolves state
 * TC-131: awaiting-merge 0 entries → escalation (exit 2)
 * TC-132: awaiting-merge 2+ entries → escalation (exit 2)
 * TC-133: cwd under awaiting-merge/<dir>/ → auto-detect
 * TC-134: multiple states for same slug → latest updatedAt chosen
 */
import * as path from "node:path";
import { listJobStates, loadJobState } from "../../state/store.js";
import { getJobSlug, stripBranchPrefix } from "../../state/job-slug.js";
import type { ResolvedTarget } from "./types.js";
import type { SpawnFn } from "../../util/spawn.js";

export interface ResolveTargetInput {
  /** Positional <slug> argument (first priority). */
  slug?: string;
  /** --pr <num>: reverse lookup via gh pr view --json headRefName. */
  prNumber?: number;
  /** --job <jobId>: direct job ID lookup (forensics / debug). */
  jobId?: string;
  /** Base directory for awaiting-merge detection (defaults to cwd). */
  cwd?: string;
  /** spawn function for gh CLI calls (required for --pr resolution). */
  spawn?: SpawnFn;
}

export type ResolveTargetResult =
  | { ok: true; target: ResolvedTarget }
  | { ok: false; exitCode: 2; message: string };

/**
 * Resolve the finish target from the given inputs.
 * Priority: slug → --pr → --job → awaiting-merge auto-detect.
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
  if (input.prNumber !== undefined && input.spawn) {
    return resolveByPrNumber(input.prNumber, input.cwd ?? process.cwd(), input.spawn, stdoutWrite);
  }

  // 3. --job <jobId> direct lookup (forensics / debug)
  if (input.jobId) {
    return resolveByJobId(input.jobId, stdoutWrite);
  }

  // 4. awaiting-merge dir auto-detection
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
 * Resolve by --pr <num>: gh pr view → headRefName → stripBranchPrefix → slug.
 *
 * TC-109: --pr 48 → headRefName feat/readme-status-section → readme-status-section
 */
async function resolveByPrNumber(
  prNumber: number,
  cwd: string,
  spawn: SpawnFn,
  stdoutWrite: (msg: string) => void,
): Promise<ResolveTargetResult> {
  const result = await spawn(
    "gh",
    ["pr", "view", String(prNumber), "--json", "headRefName"],
    { cwd },
  );

  if (result.exitCode !== 0) {
    return {
      ok: false,
      exitCode: 2,
      message: `Failed to resolve PR #${prNumber}: ${result.stderr.trim()}. Ensure 'gh' is authenticated.`,
    };
  }

  let parsed: { headRefName?: string };
  try {
    parsed = JSON.parse(result.stdout.trim()) as { headRefName?: string };
  } catch {
    return {
      ok: false,
      exitCode: 2,
      message: `Failed to parse gh pr view output: ${result.stdout}`,
    };
  }

  const headRef = parsed.headRefName ?? "";
  const slug = stripBranchPrefix(headRef);

  if (!slug) {
    return {
      ok: false,
      exitCode: 2,
      message: `Could not derive slug from headRefName '${headRef}' for PR #${prNumber}.`,
    };
  }

  return resolveBySlug(slug, cwd, stdoutWrite);
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
 * Auto-detect from awaiting-merge directory.
 *
 * TC-131: 0 entries → escalation
 * TC-132: 2+ entries → escalation
 * TC-133: cwd under awaiting-merge/<dir>/ → auto-detect
 */
async function resolveByAutoDetect(
  cwd: string,
  stdoutWrite: (msg: string) => void,
): Promise<ResolveTargetResult> {
  // TC-133: cwd itself is under awaiting-merge/<dir>/
  const cwdSlug = detectSlugFromCwd(cwd);
  if (cwdSlug) {
    stdoutWrite(`Auto-detected slug from cwd: ${cwdSlug}`);
    return resolveBySlug(cwdSlug, cwd, stdoutWrite);
  }

  const awaitingMergeDir = path.join(cwd, "openspec-workflow", "requests", "awaiting-merge");

  let entries: string[];
  try {
    const { readdir } = await import("node:fs/promises");
    const dirents = await readdir(awaitingMergeDir, { withFileTypes: true });
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
      message: "No request found in awaiting-merge/. Specify <slug>, --pr, or --job.",
    };
  }

  if (entries.length > 1) {
    return {
      ok: false,
      exitCode: 2,
      message: `Multiple slugs in awaiting-merge/: ${entries.join(", ")}. Specify <slug>, --pr, or --job.`,
    };
  }

  // Exactly 1 slug — auto-detect
  const autoSlug = entries[0]!;
  stdoutWrite(`Auto-detected awaiting-merge slug: ${autoSlug}`);

  return resolveBySlug(autoSlug, cwd, stdoutWrite);
}

/**
 * Detect slug from cwd if it's under openspec-workflow/requests/{active,awaiting-merge}/<slug>/.
 */
function detectSlugFromCwd(cwd: string): string | null {
  const PATTERN = /openspec-workflow\/requests\/(?:active|awaiting-merge)\/([^/]+)(?:\/|$)/;
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
    },
  };
}
