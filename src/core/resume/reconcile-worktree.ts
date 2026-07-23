/**
 * Worktree reconcile module for resume.
 *
 * Before starting the next step, resume mechanically reconciles the worktree to
 * establish a consistent clean start state regardless of how the previous attempt
 * stopped (halt / crash / kill).
 *
 * Three classes of dirty / untracked paths:
 *   1. protected canon paths  — handled exclusively by the apply-canon gate (not touched here).
 *   2. pipeline-managed artifacts — change-folder paths that are neither canon nor
 *      pipelineManagedPaths (e.g. spec-review-result-NNN.md). These are quarantined to
 *      .specrunner/local/<slug>/ and removed.
 *   3. non-managed paths (src/ etc., and the pipelineManagedPaths state journal) — not touched.
 *
 * Quarantine is always performed before removal (evidence-preservation guarantee).
 * If any quarantine write fails the function throws (fail-closed) — nothing has been removed yet.
 */

import { mkdir as fsMkdir, writeFile as fsWriteFile, readFile as fsReadFile } from "node:fs/promises";
import { join as pathJoin } from "node:path";
import { protectedCanonPaths } from "../step/write-scope.js";
import { pipelineManagedPaths } from "../pipeline/round-git-scope.js";
import { changeFolderPath, localSidecarDir } from "../../util/paths.js";
import { runSubprocess, gitExec, gitExecResult, type SpawnFn } from "../../util/git-exec.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconcileResult {
  reconciled: string[];
  quarantineDir: string | null;
}

type RemovalKind = "untracked" | "staged-new" | "tracked";

// ---------------------------------------------------------------------------
// Pure classifier
// ---------------------------------------------------------------------------

/**
 * Return true when the path is a pipeline-managed artifact that should be
 * quarantined and removed during worktree reconcile.
 *
 * A path is reconcilable when ALL of the following hold:
 *   1. It is under the change folder for `slug` (exact directory match, not just prefix).
 *   2. It is NOT in `protectedCanonPaths(slug)` (protected canon — apply-canon gate handles it).
 *   3. It is NOT in `pipelineManagedPaths(slug)` (state journal — preserved by resume).
 *
 * Examples:
 *   isReconcilableArtifact("specrunner/changes/foo/spec-review-result-002.md", "foo") → true
 *   isReconcilableArtifact("specrunner/changes/foo/spec.md", "foo") → false  (protected canon)
 *   isReconcilableArtifact("specrunner/changes/foo/state.json", "foo") → false  (pipelineManaged)
 *   isReconcilableArtifact("src/foo.ts", "foo") → false  (outside change folder)
 *   isReconcilableArtifact("specrunner/changes/foo-other/x.md", "foo") → false  (different dir)
 */
export function isReconcilableArtifact(path: string, slug: string): boolean {
  const folder = changeFolderPath(slug);

  // 1. Must be inside the change folder (not a same-prefix-different-dir path).
  //    Accept the folder itself OR paths strictly nested inside it.
  if (path !== folder && !path.startsWith(folder + "/")) {
    return false;
  }

  // 2. Must NOT be a protected canon path.
  if (protectedCanonPaths(slug).includes(path)) {
    return false;
  }

  // 3. Must NOT be a pipeline-managed path (state journal etc.).
  if (pipelineManagedPaths(slug).includes(path)) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Reconcile the worktree by quarantining and removing residue left by interrupted attempts.
 *
 * Algorithm:
 *   1. Run `git status --porcelain -z --no-renames` in the worktree.
 *      On spawn failure OR non-zero exit → return no-op (D7: a non-git dir has no git residue).
 *   2. Parse entries; classify each reconcilable path by removal kind.
 *   3. If no reconcilable entries → return no-op (idempotent).
 *   4. **Quarantine-all first**: mkdir + writeFile evidence. Any failure → propagate (fail-closed).
 *   5. **Remove-all second** (only after all quarantines succeeded):
 *      - untracked    → git clean -f
 *      - staged-new   → git rm --cached, then git clean -f
 *      - tracked      → git checkout HEAD
 *   6. Return { reconciled: <paths>, quarantineDir }.
 *
 * @param slug         - Job slug.
 * @param worktreePath - Absolute path to the git worktree.
 * @param spawnFn      - Injected spawn function (do NOT use defaultSpawnFn internally).
 */
export async function reconcileWorktreeArtifacts(
  slug: string,
  worktreePath: string,
  spawnFn: SpawnFn,
): Promise<ReconcileResult> {
  // ── 1. git status ──────────────────────────────────────────────────────────
  let statusResult: { stdout: string; stderr: string; exitCode: number };
  try {
    statusResult = await runSubprocess(
      spawnFn,
      "git",
      ["status", "--porcelain", "-z", "--no-renames"],
      { cwd: worktreePath },
    );
  } catch {
    // Spawn failure (ENOENT etc.) — a non-existent / non-git worktree cannot hold
    // git-tracked residue. Return no-op (D7: detection is best-effort).
    return { reconciled: [], quarantineDir: null };
  }

  if (statusResult.exitCode !== 0) {
    // Non-zero exit (e.g. not a git repo) — same rationale as spawn failure.
    return { reconciled: [], quarantineDir: null };
  }

  // ── 2. Parse NUL-delimited output ─────────────────────────────────────────
  const entries = statusResult.stdout.split("\0").filter((e) => e.length > 0);

  const reconcilable: Array<{ filePath: string; kind: RemovalKind }> = [];

  for (const entry of entries) {
    // Format: "XY PATH" (2-char status + space + path; minimum 4 chars)
    if (entry.length < 4) continue;
    const x = entry[0]!;
    const y = entry[1]!;
    const filePath = entry.slice(3);

    if (!isReconcilableArtifact(filePath, slug)) continue;

    let kind: RemovalKind;
    if (x === "?" && y === "?") {
      kind = "untracked";
    } else if (x === "A") {
      kind = "staged-new";
    } else {
      kind = "tracked";
    }

    reconcilable.push({ filePath, kind });
  }

  // ── 3. Idempotent no-op ───────────────────────────────────────────────────
  if (reconcilable.length === 0) {
    return { reconciled: [], quarantineDir: null };
  }

  // ── 4. Quarantine-all first (D4) ──────────────────────────────────────────
  // Evidence must be preserved before any removal. If mkdir or writeFile throws,
  // the error propagates (fail-closed) — nothing has been removed yet.
  const quarantineDir = pathJoin(
    worktreePath,
    localSidecarDir(slug),
    `reconcile-${Date.now()}`,
  );

  // Best-effort: ensure .specrunner/local/ is gitignored so the machine-local sidecar
  // does not show up in git status (and thus does not appear as a write-scope violation).
  // In real projects, `specrunner init` adds `.specrunner/*` to the root `.gitignore`.
  // For projects that have not run `specrunner init` (e.g. test repos), we create a
  // self-ignoring `.specrunner/local/.gitignore` with `*` — git reads .gitignore files
  // from untracked directories and `*` matches every file including `.gitignore` itself,
  // making the entire local sidecar tree invisible to `git status`.
  // Failure is silently ignored: an existing .gitignore or an unwritable path is fine
  // (the quarantine mkdir below is the real fail-closed gate).
  try {
    const sidecarLocalBase = pathJoin(worktreePath, ".specrunner", "local");
    await fsMkdir(sidecarLocalBase, { recursive: true });
    await fsWriteFile(pathJoin(sidecarLocalBase, ".gitignore"), "*\n", { flag: "wx" });
  } catch {
    // Already exists, path is a file, or not writable — proceed; the production
    // .gitignore (from `specrunner init`) will cover this case.
  }

  await fsMkdir(quarantineDir, { recursive: true });

  for (const { filePath, kind } of reconcilable) {
    // Sanitize path for use as a filename: replace "/" with "__"
    const safeName = filePath.replace(/\//g, "__") + ".md";
    const evidencePath = pathJoin(quarantineDir, safeName);

    // Prefer `git diff HEAD -- <path>` for tracked residue; fall back to raw content.
    const diff = await gitExec(spawnFn, worktreePath, ["diff", "HEAD", "--", filePath]);
    let residueSection: string;
    if (diff !== null && diff.length > 0) {
      residueSection = `## diff\n\`\`\`diff\n${diff}\n\`\`\``;
    } else {
      try {
        const raw = await fsReadFile(pathJoin(worktreePath, filePath), "utf-8");
        residueSection = `## content\n\`\`\`\n${raw}\n\`\`\``;
      } catch {
        residueSection = "## content\n(unreadable)";
      }
    }

    const evidenceContent = [
      "# reconcile evidence",
      `path: ${filePath}`,
      `kind: ${kind}`,
      `captured-at: ${new Date().toISOString()}`,
      "",
      residueSection,
    ].join("\n");

    // Throws on failure → fail-closed (nothing removed yet)
    await fsWriteFile(evidencePath, evidenceContent, "utf-8");
  }

  // ── 5. Remove-all second (D5) ─────────────────────────────────────────────
  // Only reached after every quarantine write succeeded.
  // Split by removal kind (mirroring restoreViolatedPaths in commit-push.ts).

  const untracked = reconcilable.filter((r) => r.kind === "untracked").map((r) => r.filePath);
  const stagedNew = reconcilable.filter((r) => r.kind === "staged-new").map((r) => r.filePath);
  const tracked = reconcilable.filter((r) => r.kind === "tracked").map((r) => r.filePath);

  // untracked → git clean -f
  if (untracked.length > 0) {
    const cleanResult = await gitExecResult(spawnFn, worktreePath, ["clean", "-f", "--", ...untracked]);
    if (!cleanResult.ok || cleanResult.exitCode !== 0) {
      throw new Error(
        `git clean -f failed (exit ${cleanResult.exitCode}) for untracked reconcilable paths: ${untracked.join(", ")}`,
      );
    }
  }

  // staged-new → git rm --cached, then git clean -f
  if (stagedNew.length > 0) {
    const rmResult = await gitExecResult(spawnFn, worktreePath, ["rm", "--cached", "--", ...stagedNew]);
    if (!rmResult.ok || rmResult.exitCode !== 0) {
      throw new Error(
        `git rm --cached failed (exit ${rmResult.exitCode}) for staged-new reconcilable paths: ${stagedNew.join(", ")}`,
      );
    }
    const cleanNewResult = await gitExecResult(spawnFn, worktreePath, ["clean", "-f", "--", ...stagedNew]);
    if (!cleanNewResult.ok || cleanNewResult.exitCode !== 0) {
      throw new Error(
        `git clean -f failed (exit ${cleanNewResult.exitCode}) after rm --cached for staged-new paths: ${stagedNew.join(", ")}`,
      );
    }
  }

  // tracked → git checkout HEAD
  if (tracked.length > 0) {
    const checkoutResult = await gitExecResult(spawnFn, worktreePath, ["checkout", "HEAD", "--", ...tracked]);
    if (!checkoutResult.ok || checkoutResult.exitCode !== 0) {
      throw new Error(
        `git checkout HEAD failed (exit ${checkoutResult.exitCode}) for tracked reconcilable paths: ${tracked.join(", ")}`,
      );
    }
  }

  // ── 6. Return result ──────────────────────────────────────────────────────
  return {
    reconciled: reconcilable.map((r) => r.filePath),
    quarantineDir,
  };
}
