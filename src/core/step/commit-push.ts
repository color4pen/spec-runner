import { access as fsAccess, mkdir as fsMkdir, writeFile as fsWriteFile, readFile as fsReadFile } from "node:fs/promises";
import { join as pathJoin } from "node:path";
import { localSidecarDir } from "../../util/paths.js";
import type { AgentStep } from "./types.js";
import type { JobState } from "../../state/schema.js";
import type { PipelineDeps } from "../types.js";
import type { EventBus } from "../event/event-bus.js";
import { gitExec, gitExecExitCode, gitExecResult, runSubprocess, type SpawnFn } from "../../util/git-exec.js";
import type { SpawnFn as PipelineSpawnFn } from "../../util/spawn.js";
import { stderrWrite } from "../../logger/stdout.js";
import { pushFailedError, commitEffectFailedError, writeScopeViolationError } from "../../errors.js";
import { stagingModeFor, findWriteScopeViolations } from "./write-scope.js";
import { pipelineManagedPaths } from "./round-git-scope.js";

/**
 * Return the subset of `paths` that actually exist in the filesystem at `cwd`.
 *
 * Used to filter pipeline-managed paths before calling `git add -- <paths>`:
 * git fails with exit 128 if any pathspec in the list matches no file, so we
 * must omit paths that do not exist (e.g. usage.json when no usage was recorded).
 *
 * Checks are run in parallel; non-existent paths are silently dropped.
 */
async function filterExistingFiles(paths: string[], cwd: string): Promise<string[]> {
  const results = await Promise.allSettled(
    paths.map((p) => fsAccess(pathJoin(cwd, p)).then(() => p)),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

/** Infrastructure deps for commit/push operations. */
export interface CommitPushInfra {
  spawnFn: SpawnFn;
  sleepFn: (ms: number) => Promise<void>;
  events: EventBus;
}

/**
 * Run `git status --porcelain -z --no-renames` and return the changed worktree paths.
 *
 * Returns { ok: true, paths } on success, { ok: false, paths: [] } on spawn failure or
 * non-zero exit. Never throws — callers treat ok:false as fail-closed.
 *
 * Parsing rules (same as LocalRuntime.listWorktreeChanges):
 *   - NUL-delimited entries: each entry is "XY PATH" (2-char status + space + path).
 *   - Entries shorter than 4 characters are skipped.
 *   - Path is extracted from entry.slice(3).
 */
async function getWorktreeChangedPaths(
  spawnFn: SpawnFn,
  cwd: string,
): Promise<{ ok: boolean; paths: string[] }> {
  try {
    const { stdout, exitCode } = await runSubprocess(
      spawnFn,
      "git",
      ["status", "--porcelain", "-z", "--no-renames"],
      { cwd },
    );
    if (exitCode !== 0) {
      return { ok: false, paths: [] };
    }
    const parts = stdout.split("\0").filter((p) => p.length > 0);
    const paths: string[] = [];
    for (const part of parts) {
      // Format: XY<SP>path — 2-char status + space prefix
      if (part.length < 4) continue;
      const filePath = part.slice(3);
      if (filePath) paths.push(filePath);
    }
    return { ok: true, paths };
  } catch {
    return { ok: false, paths: [] };
  }
}

/**
 * Shared tail for both scoped and guarded staging modes.
 *
 * Runs after staging is complete:
 * 1. git diff --cached --quiet → determine if staged changes exist.
 * 2. No staged changes → check if HEAD advanced (agent self-committed) → push-only or skip.
 * 3. Staged changes → commit + push.
 */
async function commitAndPushTail(
  step: AgentStep,
  headBeforeStep: string | null,
  infra: CommitPushInfra,
  cwd: string,
  branch: string,
  slug: string,
): Promise<void> {
  // Check if there are staged changes.
  // `git diff --cached --quiet` exits 0 when no staged changes, 1 when there are staged changes,
  // ≥2 on git error (spawn failure or error exit code) → throws typed error → halt path.
  const diffResult = await gitExecResult(infra.spawnFn, cwd, ["diff", "--cached", "--quiet"]);
  if (!diffResult.ok || diffResult.exitCode >= 2) {
    throw commitEffectFailedError(step.name, branch, "diff", `exit code ${diffResult.exitCode}`);
  }
  const hasChanges = diffResult.exitCode === 1;

  if (!hasChanges) {
    // Check if HEAD advanced (agent self-committed before pipeline commit).
    const headAfterStep = await gitExec(infra.spawnFn, cwd, ["rev-parse", "HEAD"]);
    if (headBeforeStep && headAfterStep && headAfterStep !== headBeforeStep) {
      // Agent authored commit(s) since step start — push the existing commits as-is.
      stderrWrite("Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is.\n");
      await pushOnly(branch, cwd, step.name, infra);
      return;
    }
    // No changes and no agent self-commit — silently skip (step completed via tool, no file writes needed)
    return;
  }

  // Commit. Failure (spawn error or exit≠0) throws typed error → never falls through to push.
  const commitMessage = `${step.name}: ${slug}`;
  const commitResult = await gitExecResult(infra.spawnFn, cwd, ["commit", "-m", commitMessage]);
  if (!commitResult.ok || commitResult.exitCode !== 0) {
    throw commitEffectFailedError(step.name, branch, "commit", `exit code ${commitResult.exitCode}`);
  }

  // Push with one retry
  await pushOnly(branch, cwd, step.name, infra);
}


/**
 * Preserve the content of write-scope-violating changes before they are restored.
 *
 * The violating content is evidence (what the agent attempted to write outside its
 * boundary). Restoration is mechanically required so the post-halt checkpoint commit
 * (commitFinalState: git add -A) cannot leak the violation to the remote branch — but
 * restoring without capture would destroy the evidence a human needs to judge the halt.
 *
 * Captures, per violating path: the tracked diff vs HEAD, or the full content when the
 * file is untracked (not in HEAD). Written to the machine-local sidecar directory
 * (.specrunner/local/<slug>/ — never committed).
 *
 * Best-effort: returns the quarantine file path, or null on any failure. Failure never
 * blocks the halt.
 */
async function quarantineViolationEvidence(
  spawnFn: SpawnFn,
  cwd: string,
  slug: string,
  stepName: string,
  violations: string[],
): Promise<string | null> {
  try {
    const sections: string[] = [
      `# write-scope violation evidence`,
      `step: ${stepName}`,
      `captured-at: ${new Date().toISOString()}`,
      `paths:`,
      ...violations.map((v) => `  - ${v}`),
      "",
    ];
    for (const v of violations) {
      const diff = await gitExec(spawnFn, cwd, ["diff", "HEAD", "--", v]);
      if (diff !== null && diff.length > 0) {
        sections.push(`## diff: ${v}`, "```diff", diff, "```", "");
      } else {
        // Untracked (not in HEAD) or diff unavailable — capture raw content.
        try {
          const content = await fsReadFile(pathJoin(cwd, v), "utf-8");
          sections.push(`## untracked content: ${v}`, "```", content, "```", "");
        } catch {
          sections.push(`## unreadable: ${v}`, "");
        }
      }
    }
    const dir = pathJoin(cwd, localSidecarDir(slug));
    await fsMkdir(dir, { recursive: true });
    const file = pathJoin(dir, `write-scope-violation-${stepName}-${Date.now()}.md`);
    await fsWriteFile(file, sections.join("\n"), "utf-8");
    return file;
  } catch {
    return null;
  }
}
/**
 * Stage all changes, commit, and push to origin.
 *
 * Branching on staging mode (from write-scope single source):
 *
 * "scoped" mode (deterministic steps: design, spec-review, spec-fixer, etc.):
 *   - Stage only declared outputs: git add -A -- <step.writes() + pipelineManagedPaths>.
 *   - Boundary-external changes in the worktree are silently excluded from the commit.
 *   - After staging, any protected paths that remain dirty are restored to HEAD via
 *     git checkout HEAD -- <residualViolations>. This prevents residual dirty protected
 *     files (e.g. request.md changed by a scoped step but excluded from its commit) from
 *     causing misattributed WRITE_SCOPE_VIOLATION halts in subsequent guarded steps.
 *   - If stagePaths is empty, no-op (nothing to stage or commit).
 *
 * "guarded" mode (broad-write steps: implementer, build-fixer, code-fixer, etc.):
 *   - Pre-check: git status --porcelain -z --no-renames → list changed paths.
 *   - Violation detection: findWriteScopeViolations → halt if any forbidden path changed.
 *   - Status spawn failure / non-zero exit → fail-closed halt.
 *   - If violations: two-step restore (git clean -f for untracked new files; git checkout
 *     HEAD for tracked modified files) then throws WRITE_SCOPE_VIOLATION.
 *   - If no violations: git add -A → stage whole worktree (original behaviour).
 *
 * Shared tail (both modes):
 *   - git diff --cached --quiet:
 *     - exit 0 = no staged changes → check HEAD advance
 *     - exit 1 = staged changes present → commit
 *     - exit ≥2 or spawn failure → throws commitEffectFailedError("diff") → halt path
 *   - if no changes:
 *     - compare headBeforeStep with current HEAD
 *     - if HEAD advanced (agent self-committed): push only, log detection message
 *     - otherwise: silently return (no commit needed, step completed via tool)
 *   - git commit -m "${step.name}: ${slug}"
 *   - git push origin ${branch} — retry once after 5s on failure
 */
export async function commitAndPush(
  step: AgentStep,
  state: JobState,
  deps: PipelineDeps,
  headBeforeStep: string | null,
  infra: CommitPushInfra,
): Promise<void> {
  const cwd = deps.cwd ?? process.cwd();
  const branch = state.branch ?? "";
  const slug = deps.slug;
  const mode = stagingModeFor(step.name);

  if (mode === "scoped") {
    // Scoped staging: limit to declared outputs + pipeline-managed paths.
    const writes = step.writes?.(state, deps) ?? [];
    const filePaths = writes.filter((r) => r.artifact !== "gitState").map((r) => r.path);
    // Filter managed paths to existing files: git add -A -- <path> fails with exit 128
    // for any pathspec that matches no file (e.g. usage.json when no usage was recorded).
    const existingManaged = await filterExistingFiles(pipelineManagedPaths(slug), cwd);
    const stagePaths = [...new Set([...filePaths, ...existingManaged])];

    // Stage only declared paths when there are any.
    // Empty stagePaths → skip git add (git add -A -- <empty> is invalid).
    // We still fall through to commitAndPushTail for HEAD-advance detection.
    if (stagePaths.length > 0) {
      // Stage only the declared paths. Failure → halt.
      const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ...stagePaths]);
      if (!addResult.ok || addResult.exitCode !== 0) {
        throw commitEffectFailedError(step.name, branch, "stage", `exit code ${addResult.exitCode}`);
      }

      // After scoped staging: restore any protected paths that remain dirty in the worktree
      // but were not staged (because they are outside the scoped step's declared outputs).
      // Without this, a scoped step that inadvertently changes request.md (or another canon
      // path) leaves the worktree dirty, causing the NEXT guarded step's pre-commit check to
      // emit a misattributed WRITE_SCOPE_VIOLATION against the wrong step.
      //
      // Two-step restore: git clean removes newly created (untracked) files that are not in
      // HEAD (git checkout HEAD would fail for those, leaving them in the worktree).
      // git checkout HEAD then restores tracked modified files to their committed content.
      // Both are best-effort (failures silently ignored).
      //
      // Asymmetry note: postStatus.ok===false → skip silently (best-effort).
      // Scoped restoration is defensive (prevents cross-step false positives), not
      // safety-critical. Guarded mode is the hard enforcement gate (fail-closed).
      const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd);
      if (postStatus.ok && postStatus.paths.length > 0) {
        const residualViolations = findWriteScopeViolations(step.name, slug, postStatus.paths, filePaths);
        if (residualViolations.length > 0) {
          // Preserve evidence before restore, and surface the event — a scoped step wrote
          // outside its declared outputs. The change is excluded from the commit either way;
          // silent destruction would hide the boundary breach entirely.
          const residualQuarantine = await quarantineViolationEvidence(
            infra.spawnFn, cwd, slug, step.name, residualViolations,
          );
          stderrWrite(
            `[${step.name}] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): ${residualViolations.join(", ")}` +
            (residualQuarantine ? ` — 退避先: ${residualQuarantine}` : ""),
          );
          await gitExecResult(infra.spawnFn, cwd, ["clean", "-f", "--", ...residualViolations]);
          await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...residualViolations]);
        }
      }
    }
  } else {
    // Guarded mode: pre-check for write-scope violations before staging.

    // List all changed paths in the worktree.
    const statusResult = await getWorktreeChangedPaths(infra.spawnFn, cwd);
    if (!statusResult.ok) {
      // git status spawn failure or non-zero exit → fail-closed.
      throw commitEffectFailedError(step.name, branch, "stage", "git status failed");
    }

    // Resolve declared write paths (excluding git-state artifacts).
    const writes = step.writes?.(state, deps) ?? [];
    const declaredWritePaths = writes.filter((r) => r.artifact !== "gitState").map((r) => r.path);

    // Check for forbidden boundary violations.
    const violations = findWriteScopeViolations(step.name, slug, statusResult.paths, declaredWritePaths);
    if (violations.length > 0) {
      // Preserve the violating content BEFORE restoring — the restore is mechanically
      // required (see below) but the content is the evidence a human needs at the halt.
      const quarantinePath = await quarantineViolationEvidence(
        infra.spawnFn, cwd, slug, step.name, violations,
      );
      // Restore violated paths before throwing so commitFinalState's git add -A does not
      // pick them up and commit them to the remote branch (defeating the fail-closed guarantee).
      //
      // Two-step restore handles both tracked and untracked violations:
      //   1. git clean -f -- <violations>: removes newly created (untracked) violations.
      //      These files are not in HEAD, so git checkout HEAD would fail and leave them in
      //      the worktree where commitFinalState's git add -A would then pick them up.
      //   2. git checkout HEAD -- <violations>: restores tracked modified violations to their
      //      committed content.
      // Both operations are best-effort (failures silently ignored). The throw always occurs.
      await gitExecResult(infra.spawnFn, cwd, ["clean", "-f", "--", ...violations]);
      await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...violations]);
      throw writeScopeViolationError(step.name, branch, violations, quarantinePath);
    }

    // No violations — stage whole worktree (original behaviour).
    const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A"]);
    if (!addResult.ok || addResult.exitCode !== 0) {
      throw commitEffectFailedError(step.name, branch, "stage", `exit code ${addResult.exitCode}`);
    }
  }

  // Shared tail: diff check, HEAD-advance detection, commit, push.
  await commitAndPushTail(step, headBeforeStep, infra, cwd, branch, slug);
}

/**
 * Commit final pipeline state to the feature branch.
 *
 * D5 (remote-checkpoint-publish-attach-closure): called after terminal transitions.
 * - awaiting-archive: messageLabel = "finalize" (existing behavior, unchanged).
 * - awaiting-resume:  messageLabel = "checkpoint" (new seam in pipeline.ts).
 *
 * Stages all changes (git add -A), commits if there are staged changes
 * (message: "<messageLabel>: <slug>"), and pushes with one retry.
 *
 * Write-scope safety: when commitFinalState is called after a WRITE_SCOPE_VIOLATION
 * halt, the guarded-mode commitAndPush has already restored violated files to their
 * HEAD state via git checkout HEAD before throwing. Therefore, git add -A here does
 * not pick up violation content — those files are already clean (match HEAD).
 *
 * Idempotent: if no staged changes, returns immediately (no-op).
 * Push failures: warns on stderr but does NOT throw — local resume is preserved.
 *
 * Uses `spawn.ts` SpawnFn (same as LocalRuntime.spawnFn) so the same injection
 * point works without any adapter.
 *
 * @param params.messageLabel - Optional commit message label. Defaults to "finalize".
 *   awaiting-resume publish passes "checkpoint"; awaiting-archive passes "finalize".
 */
export async function commitFinalState(params: {
  cwd: string;
  branch: string;
  slug: string;
  spawnFn: PipelineSpawnFn;
  messageLabel?: string;
}): Promise<void> {
  const { cwd, branch, slug, spawnFn, messageLabel = "finalize" } = params;

  // Stage all changes. When called after a WRITE_SCOPE_VIOLATION halt, guarded-mode
  // commitAndPush has already restored violated files to HEAD via git checkout HEAD
  // before throwing — so this git add -A does not pick up any violation content.
  const addResult = await spawnFn("git", ["add", "-A"], { cwd });
  if ((addResult.exitCode ?? 1) !== 0) {
    // Not a git repo or git is non-functional — skip silently
    return;
  }

  // Check for staged changes (exit 1 = changes present, exit 0 = clean)
  const diffResult = await spawnFn("git", ["diff", "--cached", "--quiet"], { cwd });
  if ((diffResult.exitCode ?? 0) !== 1) {
    // No staged changes — nothing to commit
    return;
  }

  // Commit
  const commitResult = await spawnFn("git", ["commit", "-m", `${messageLabel}: ${slug}`], { cwd });
  if ((commitResult.exitCode ?? 1) !== 0) {
    stderrWrite(`Warning: ${messageLabel} commit failed for ${slug}. Push manually to ensure state is on the branch.`);
    return;
  }

  // Push with one retry (best-effort — don't throw on failure)
  const push1 = await spawnFn("git", ["push", "origin", branch], { cwd });
  if ((push1.exitCode ?? 1) === 0) return;

  const push2 = await spawnFn("git", ["push", "origin", branch], { cwd });
  if ((push2.exitCode ?? 1) === 0) return;

  stderrWrite(
    `Warning: failed to push ${messageLabel} commit for ${slug} to origin/${branch}. ` +
      `Push manually to ensure state is on the branch.`,
  );
}

/**
 * Stage only the declared paths and commit+push if there are staged changes.
 *
 * D3 (round-owned-git-effects): coordinator-owned scoped staging.
 * Unlike commitAndPush, this function NEVER calls `git add -A` indiscriminately.
 * It limits staging to the explicit `stagePaths` list via `git add -A -- <paths...>`.
 *
 * Workflow:
 *   1. stagePaths empty → no-op (nothing to stage or commit).
 *   2. `git add -A -- <stagePaths...>` (pathspec-limited; also stages deletions for listed paths).
 *      If add fails (spawn error or exit≠0) → throws commitEffectFailedError("stage").
 *   3. `git diff --cached --quiet`:
 *      - exit 0 → no staged changes → no-op (nothing was changed in the declared paths).
 *      - exit 1 → staged changes → commit then push.
 *      - ≥2 or spawn failure → throws commitEffectFailedError("diff").
 *   4. `git commit -m <commitMessage>`: failure throws commitEffectFailedError("commit").
 *   5. `pushOnly` (one retry on failure, throws pushFailedError on double failure).
 *
 * @param stagePaths    - Worktree-relative paths to stage (must all be declared outputs).
 * @param cwd           - Working directory for git commands.
 * @param branch        - Branch to push to.
 * @param commitMessage - Commit message (typically "<coordinator>: <slug>").
 * @param infra         - Commit/push infrastructure (spawnFn, sleepFn, events).
 */
export async function commitScopedPaths(
  stagePaths: string[],
  cwd: string,
  branch: string,
  commitMessage: string,
  infra: CommitPushInfra,
): Promise<void> {
  if (stagePaths.length === 0) return;

  // Stage only the declared paths (pathspec-limited; never `git add -A` without pathspec).
  // Failure (spawn error or exit≠0) throws typed error → halt path.
  const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ...stagePaths]);
  if (!addResult.ok || addResult.exitCode !== 0) {
    throw commitEffectFailedError(commitMessage, branch, "stage", `exit code ${addResult.exitCode}`);
  }

  // Check if there are staged changes.
  // exit 0 = no staged changes; exit 1 = staged changes present;
  // ≥2 (or spawn failure) = git error → throws typed error → halt path.
  const diffResult = await gitExecResult(infra.spawnFn, cwd, ["diff", "--cached", "--quiet"]);
  if (!diffResult.ok || diffResult.exitCode >= 2) {
    throw commitEffectFailedError(commitMessage, branch, "diff", `exit code ${diffResult.exitCode}`);
  }
  const hasChanges = diffResult.exitCode === 1;
  if (!hasChanges) return;

  // Commit. Failure (spawn error or exit≠0) throws typed error → never falls through to push.
  const commitResult = await gitExecResult(infra.spawnFn, cwd, ["commit", "-m", commitMessage]);
  if (!commitResult.ok || commitResult.exitCode !== 0) {
    throw commitEffectFailedError(commitMessage, branch, "commit", `exit code ${commitResult.exitCode}`);
  }

  // Push with one retry (uses commitMessage as step label for the event)
  await pushOnly(branch, cwd, commitMessage, infra);
}

/**
 * Push to origin with one retry on failure.
 * Emits commit:push event on success.
 * Throws pushFailedError if both attempts fail.
 */
export async function pushOnly(branch: string, cwd: string, stepName: string, infra: CommitPushInfra): Promise<void> {
  const tryPush = () => gitExecExitCode(infra.spawnFn, cwd, ["push", "origin", branch]);

  const firstPushCode = await tryPush();
  if (firstPushCode === 0) {
    infra.events.emit("commit:push", { step: stepName, branch });
    return;
  }

  // Retry after 5 seconds (injectable for testing)
  await infra.sleepFn(5000);
  const secondPushCode = await tryPush();
  if (secondPushCode === 0) {
    infra.events.emit("commit:push", { step: stepName, branch });
    return;
  }

  throw pushFailedError(stepName, branch, `exit code ${secondPushCode}`);
}
