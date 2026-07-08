/**
 * Post-merge integrity check for `job archive --with-merge`.
 *
 * After a squash merge succeeds, creates an ephemeral detached worktree at the
 * resulting merge SHA and runs the caller-supplied commands fail-fast.
 * A non-zero exit produces an escalation with PR / SHA attribution and remediation.
 *
 * Infrastructure failures (fetch, rev-parse, worktree add) are treated as
 * "unable to verify" — a warning is emitted and { ok: true } is returned so the
 * archive flow is not blocked.  The warning is the honest signal.
 *
 * Invariants:
 * - No node:child_process import (all subprocesses via injected SpawnFn).
 * - No direct process.env access.
 */
import * as nodePath from "node:path";
import type { SpawnFn } from "../../util/spawn.js";
import type { ShellCommand } from "../../config/schema.js";
import { createTransportAuth } from "../../git/transport-auth.js";
import { formatEscalation } from "../finish/escalation.js";
import { stderrWrite } from "../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PostMergeIntegrityInput {
  /** Slug of the archived job. */
  slug: string;
  /** Main repo root (cwd). */
  cwd: string;
  /** Base branch name (e.g. "main"). */
  baseBranch: string;
  /** Commands to run in the ephemeral worktree (must be non-empty; caller ensures this). */
  commands: ShellCommand[];
  /** Injected spawn function. */
  spawn: SpawnFn;
  /** Resolved GitHub token for authenticating git fetch on private HTTPS repos. */
  githubToken?: string;
  /** PR number that was merged (used for attribution in escalation). */
  prNumber: number;
}

export type PostMergeIntegrityResult =
  | { ok: true }
  | { ok: false; escalation: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface NormalizedCommand {
  /** Display label (command string when name is absent). */
  name: string | undefined;
  run: string;
}

function normalizeCommand(cmd: ShellCommand): NormalizedCommand {
  if (typeof cmd === "string") {
    return { name: undefined, run: cmd };
  }
  return { name: cmd.name, run: cmd.run };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run post-merge integrity checks on the merged base branch.
 *
 * Steps:
 *   1. fetch origin/<baseBranch> to update local refs
 *   2. rev-parse to get merge SHA
 *   3. create ephemeral detached worktree at merge SHA
 *   4. run commands fail-fast inside the worktree
 *   5. always remove the worktree (best-effort, finally block)
 *
 * Returns { ok: true } on success or infrastructure failure,
 * { ok: false, escalation } when a command exits non-zero.
 */
export async function runPostMergeIntegrityCheck(
  input: PostMergeIntegrityInput,
): Promise<PostMergeIntegrityResult> {
  const { slug, cwd, baseBranch, commands, githubToken, prNumber } = input;

  // Only wrap with transport auth when a token is provided (avoids a git remote
  // get-url subprocess in tests / environments without a real git repo at cwd).
  const spawn: SpawnFn = githubToken
    ? createTransportAuth({ token: githubToken, cwd }).wrapSpawn(input.spawn)
    : input.spawn;

  const normalized = commands.map(normalizeCommand);

  // -------------------------------------------------------------------------
  // Step 1: fetch origin/<baseBranch>
  // -------------------------------------------------------------------------
  let fetchResult: Awaited<ReturnType<SpawnFn>>;
  try {
    fetchResult = await spawn("git", ["fetch", "origin", baseBranch], { cwd });
  } catch (err) {
    stderrWrite(
      `[specrunner] Warning: post-merge integrity check: git fetch threw: ${(err as Error).message}. ` +
        `Base branch (${baseBranch}) integrity NOT verified.`,
    );
    return { ok: true };
  }

  if (fetchResult.exitCode !== 0) {
    stderrWrite(
      `[specrunner] Warning: post-merge integrity check: could not fetch origin/${baseBranch} ` +
        `(exit ${fetchResult.exitCode}: ${fetchResult.stderr.trim()}). ` +
        `Base branch integrity NOT verified.`,
    );
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Step 2: resolve merge SHA via rev-parse
  // -------------------------------------------------------------------------
  let revParseResult: Awaited<ReturnType<SpawnFn>>;
  try {
    revParseResult = await spawn("git", ["rev-parse", `origin/${baseBranch}`], { cwd });
  } catch (err) {
    stderrWrite(
      `[specrunner] Warning: post-merge integrity check: git rev-parse threw: ${(err as Error).message}. ` +
        `Base branch integrity NOT verified.`,
    );
    return { ok: true };
  }

  if (revParseResult.exitCode !== 0 || !revParseResult.stdout.trim()) {
    stderrWrite(
      `[specrunner] Warning: post-merge integrity check: could not resolve origin/${baseBranch} ` +
        `(exit ${revParseResult.exitCode}: ${revParseResult.stderr.trim()}). ` +
        `Base branch integrity NOT verified.`,
    );
    return { ok: true };
  }

  const mergeSha = revParseResult.stdout.trim();
  const sha8 = mergeSha.slice(0, 8);
  const sha7 = mergeSha.slice(0, 7);
  const integrityPath = nodePath.join(
    cwd,
    ".git",
    "specrunner-worktrees",
    `integrity-${slug}-${sha8}`,
  );

  // -------------------------------------------------------------------------
  // Step 3: create ephemeral detached worktree
  // -------------------------------------------------------------------------
  let worktreeAdded = false;
  let worktreeAddResult: Awaited<ReturnType<SpawnFn>>;
  try {
    worktreeAddResult = await spawn(
      "git",
      ["worktree", "add", "--detach", integrityPath, mergeSha],
      { cwd },
    );
  } catch (err) {
    stderrWrite(
      `[specrunner] Warning: post-merge integrity check: git worktree add threw: ${(err as Error).message}. ` +
        `Base branch integrity NOT verified.`,
    );
    return { ok: true };
  }

  if (worktreeAddResult.exitCode !== 0) {
    stderrWrite(
      `[specrunner] Warning: post-merge integrity check: could not create worktree at ${integrityPath} ` +
        `(exit ${worktreeAddResult.exitCode}: ${worktreeAddResult.stderr.trim()}). ` +
        `Base branch integrity NOT verified.`,
    );
    return { ok: true };
  }

  worktreeAdded = true;

  // -------------------------------------------------------------------------
  // Steps 4 + 5: run commands fail-fast; always cleanup worktree
  // -------------------------------------------------------------------------
  let failedLabel: string | undefined;
  let failedExitCode: number | null = null;
  let failedOutput = "";

  try {
    for (const cmd of normalized) {
      const result = await spawn("sh", ["-c", cmd.run], { cwd: integrityPath });
      if (result.exitCode !== 0) {
        failedLabel = cmd.name ?? cmd.run;
        failedExitCode = result.exitCode;
        // Combine stdout + stderr so the full output is available in the escalation.
        failedOutput = [result.stdout, result.stderr].filter((s) => s.length > 0).join("\n");
        break;
      }
    }
  } finally {
    // Best-effort worktree removal.  Use the raw (un-wrapped) spawn so cleanup
    // does not trigger transport-auth URL resolution unnecessarily.
    if (worktreeAdded) {
      try {
        const removeResult = await input.spawn(
          "git",
          ["worktree", "remove", "--force", integrityPath],
          { cwd },
        );
        if (removeResult.exitCode !== 0) {
          stderrWrite(
            `[specrunner] Warning: failed to remove integrity worktree at ${integrityPath}. ` +
              `Run 'git worktree prune' manually.`,
          );
        }
        // Prune stale worktree references even if remove succeeded/failed.
        await input.spawn("git", ["worktree", "prune"], { cwd });
      } catch {
        stderrWrite(
          `[specrunner] Warning: failed to clean up integrity worktree at ${integrityPath}. ` +
            `Run 'git worktree prune' manually.`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: report result
  // -------------------------------------------------------------------------
  if (failedLabel !== undefined) {
    const escalation = formatEscalation({
      failedStep: `post-merge integrity check (${baseBranch})`,
      detectedState:
        `PR #${prNumber} was MERGED into ${baseBranch} at merge commit ${sha7}.\n` +
        `  This merge failed the post-merge integrity check.\n` +
        `  Failed command: "${failedLabel}" (exit code ${failedExitCode ?? "null"})\n` +
        `  Command output:\n${failedOutput}`,
      recommendedAction:
        `${baseBranch} may be in a broken state — downstream job workspace setup (frozen install) will fail.\n` +
        `  The merge is NOT rolled back (irreversible; auto-revert is unsafe).\n` +
        `  Fix steps:\n` +
        `    1. git checkout ${baseBranch}\n` +
        `    2. Reproduce the failure: ${failedLabel}\n` +
        `    3. Regenerate the lockfile / fix the issue\n` +
        `    4. git add <fixed-files> && git commit -m "fix: post-merge integrity"\n` +
        `    5. git push origin ${baseBranch}`,
      resumeCommand: `specrunner job archive --with-merge ${slug}`,
    });
    return { ok: false, escalation };
  }

  return { ok: true };
}
