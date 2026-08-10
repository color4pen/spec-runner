/**
 * Operator commit adoption helpers for resume --adopt-commits.
 *
 * Provides two exported functions:
 *   - detectUnadoptedCommits: enumerate publish-range OIDs not in the synthesizedCommits ledger.
 *   - buildAdoptEscalationMessage: format the operator-facing escalation message when unknown
 *     commits are detected and --adopt-commits was not specified.
 *
 * Design:
 *   - detectUnadoptedCommits is fail-closed: throws on git rev-list failure so that
 *     "git failed" is never confused with "no unadopted commits".
 *   - Exit code 128 (not a git repository) is treated by the caller as an empty range:
 *     test/dev environments without git should not be blocked.
 *   - Metadata (shortSha / subject / author / paths) is gathered best-effort via gitExec
 *     (returns null on failure). A missing field falls back gracefully and never aborts detection.
 *   - Do NOT import defaultSpawnFn — callers must inject the spawn function.
 */

import { runSubprocess, gitExec, type SpawnFn } from "../../util/git-exec.js";
import { egressResolutionOptions } from "../../errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnadoptedCommit {
  oid: string;
  shortSha: string;
  subject: string;
  author: string;
  paths: string[];
}

// ---------------------------------------------------------------------------
// detectUnadoptedCommits
// ---------------------------------------------------------------------------

/**
 * Detect publish-range commits whose OIDs are not in the synthesizedCommits ledger.
 *
 * Algorithm:
 *   1. Run `git rev-list HEAD --not --remotes=origin` in `gitDir`.
 *      On non-zero exit, throw an Error whose message includes the exit code.
 *      (Callers apply the exit-128 carve-out for non-git directories.)
 *   2. Build a Set from `ledger`. Keep only OIDs NOT in the set.
 *   3. For each unknown OID, gather metadata best-effort:
 *      - short SHA + subject + author: `git show -s --format=%h%x1f%s%x1f%an <oid>`
 *      - changed paths: `git diff-tree --no-commit-id --name-only -r <oid>`
 *   4. Return the UnadoptedCommit[] (empty when no unknown OIDs).
 *
 * @param gitDir  - Absolute path to the git working tree (cwd for git commands).
 * @param ledger  - Current synthesizedCommits ledger (read-only).
 * @param spawnFn - Injected spawn function; callers must not use defaultSpawnFn here.
 * @returns Array of unknown commits with metadata (empty when all are known).
 * @throws Error when `git rev-list` exits non-zero.
 */
export async function detectUnadoptedCommits(
  gitDir: string,
  ledger: readonly string[],
  spawnFn: SpawnFn,
): Promise<UnadoptedCommit[]> {
  // Step 1: run git rev-list to get the publish range
  let revListResult: { stdout: string; stderr: string; exitCode: number };
  try {
    revListResult = await runSubprocess(
      spawnFn,
      "git",
      ["rev-list", "HEAD", "--not", "--remotes=origin"],
      { cwd: gitDir },
    );
  } catch (spawnErr) {
    // ENOENT means the working directory (or the git binary) is absent — the same situation
    // git reports as exit 128 when the path exists but is not a repository. Only that case is
    // rewritten so the caller's non-git carve-out applies and resumes continue normally in
    // environments without a real worktree (test harnesses, dev sandboxes).
    //
    // Every other spawn failure (EACCES, EMFILE, ...) propagates unchanged so the caller
    // fails closed. Reporting them as "exit 128" would make an unverifiable publish range
    // indistinguishable from an empty one and silently skip this gate.
    if ((spawnErr as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `git rev-list failed (exit 128): spawn failed — ${(spawnErr as Error).message}`,
      );
    }
    throw spawnErr;
  }

  if (revListResult.exitCode !== 0) {
    throw new Error(
      `git rev-list failed (exit ${revListResult.exitCode}): ${revListResult.stderr.trim()}`,
    );
  }

  // Step 2: filter to OIDs not in the ledger
  const allOids = revListResult.stdout
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const ledgerSet = new Set(ledger);
  const unknownOids = allOids.filter((oid) => !ledgerSet.has(oid));

  if (unknownOids.length === 0) {
    return [];
  }

  // Step 3: gather metadata best-effort for each unknown OID
  const commits: UnadoptedCommit[] = [];

  for (const oid of unknownOids) {
    // short SHA + subject + author via git show -s --format=%h%x1f%s%x1f%an
    const meta = await gitExec(spawnFn, gitDir, [
      "show",
      "-s",
      `--format=%h%x1f%s%x1f%an`,
      oid,
    ]);

    let shortSha = oid.slice(0, 7);
    let subject = "";
    let author = "";

    if (meta !== null && meta.length > 0) {
      const parts = meta.split("\x1f");
      shortSha = parts[0] ?? oid.slice(0, 7);
      subject = parts[1] ?? "";
      author = parts[2] ?? "";
    }

    // Changed paths via git diff-tree
    const pathsRaw = await gitExec(spawnFn, gitDir, [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      oid,
    ]);
    const paths =
      pathsRaw !== null
        ? pathsRaw
            .split("\n")
            .map((p) => p.trim())
            .filter((p) => p.length > 0)
        : [];

    commits.push({ oid, shortSha, subject, author, paths });
  }

  return commits;
}

// ---------------------------------------------------------------------------
// buildAdoptionHaltMessage
// ---------------------------------------------------------------------------

/**
 * Build the unified operator-facing halt message for Gate 1 fail-closed halt.
 *
 * Covers three cases:
 *   - canon-only: dirtyCanonPaths non-empty, unadoptedCommits empty
 *   - canon+commits: both non-empty
 *   - detection-failed: dirtyCanonPaths non-empty, commit detection failed
 *
 * The complete command in the output includes --apply-canon when dirtyCanonPaths is
 * non-empty and --adopt-commits when unadoptedCommits is non-empty (and detection
 * did not fail). If commitDetectionFailed is true, --adopt-commits is omitted
 * (fail-closed: do not recommend adopting commits that could not be verified).
 *
 * @param args.slug                 - Job slug (substituted into the resume command).
 * @param args.dirtyCanonPaths      - Dirty protected canon paths detected.
 * @param args.unadoptedCommits     - Unknown commits detected (empty if none or detection failed).
 * @param args.commitDetectionFailed - True when preflight adopt detection failed (non-128 error).
 * @returns Formatted halt message string.
 */
export function buildAdoptionHaltMessage(args: {
  slug: string;
  dirtyCanonPaths: string[];
  unadoptedCommits: UnadoptedCommit[];
  commitDetectionFailed?: boolean;
}): string {
  const { slug, dirtyCanonPaths, unadoptedCommits, commitDetectionFailed = false } = args;

  const lines: string[] = [];

  // Header
  if (commitDetectionFailed) {
    lines.push("Protected canon changes detected. Unknown commit detection failed. No step was run.");
  } else if (unadoptedCommits.length > 0) {
    lines.push("Protected canon changes and unadopted commits detected. No step was run.");
  } else {
    lines.push("Protected canon changes detected. No step was run.");
  }
  lines.push("");

  // Dirty canon path listing
  if (dirtyCanonPaths.length > 0) {
    lines.push("Modified canon paths:");
    for (const p of dirtyCanonPaths) {
      lines.push(`  ${p}`);
    }
    lines.push("");
  }

  // Unadopted commit listing or detection-failure note
  if (commitDetectionFailed) {
    lines.push("Note: detection of unadopted commits failed (non-fatal git error). Resolve canon changes first,");
    lines.push("      then resume again so the adopt check can run.");
    lines.push("");
  } else if (unadoptedCommits.length > 0) {
    lines.push("Unadopted commits:");
    for (const commit of unadoptedCommits) {
      lines.push(`  ${commit.shortSha} — ${commit.subject}`);
      lines.push(`    Author: ${commit.author}`);
      if (commit.paths.length > 0) {
        lines.push("    Changed paths:");
        for (const p of commit.paths) {
          lines.push(`      ${p}`);
        }
      }
    }
    lines.push("");
  }

  // Complete command
  const flags: string[] = ["--apply-canon"];
  if (unadoptedCommits.length > 0 && !commitDetectionFailed) {
    flags.push("--adopt-commits");
  }
  const cmd = `specrunner job resume ${slug} ${flags.join(" ")}`;

  lines.push("To proceed:");
  lines.push(`  ${cmd}`);
  lines.push("");

  // Alternatives
  lines.push("Alternatives:");
  for (const p of dirtyCanonPaths) {
    lines.push(`  Discard canon changes:  git checkout HEAD -- ${p}`);
  }
  if (unadoptedCommits.length > 0 && !commitDetectionFailed) {
    lines.push("  Push the commit(s) to origin so they leave the publish range.");
    lines.push("  Remove or revert the commit(s) (git reset / git revert) so they leave the publish range.");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// buildAdoptEscalationMessage
// ---------------------------------------------------------------------------

/**
 * Build the operator-facing escalation message when unknown commits are detected
 * and --adopt-commits was not specified.
 *
 * The message:
 *   - States that unknown (non-pipeline) commits were found and no step was run.
 *   - Lists each commit with its short SHA, subject, author, and changed paths.
 *   - Presents the three resolution options via egressResolutionOptions(slug).
 *
 * @param slug    - Job slug (substituted into the --adopt-commits command).
 * @param commits - The list of unadopted commits (should be non-empty).
 * @returns Formatted escalation message string.
 */
export function buildAdoptEscalationMessage(
  slug: string,
  commits: UnadoptedCommit[],
): string {
  const lines: string[] = [
    "Unknown (non-pipeline) commits were found in the push range. No step was run.",
    "",
  ];

  for (const commit of commits) {
    lines.push(`Commit: ${commit.shortSha} — ${commit.subject}`);
    lines.push(`  Author: ${commit.author}`);
    if (commit.paths.length > 0) {
      lines.push("  Changed paths:");
      for (const p of commit.paths) {
        lines.push(`    ${p}`);
      }
    }
    lines.push("");
  }

  lines.push(egressResolutionOptions(slug));

  return lines.join("\n");
}
