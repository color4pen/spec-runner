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
 * Stage all changes, commit, and push to origin.
 *
 * Branching on staging mode (from write-scope single source):
 *
 * "scoped" mode (deterministic steps: design, spec-review, spec-fixer, etc.):
 *   - Stage only declared outputs: git add -A -- <step.writes() + pipelineManagedPaths>.
 *   - Boundary-external changes in the worktree are silently excluded from the commit.
 *   - If stagePaths is empty, no-op (nothing to stage or commit).
 *
 * "guarded" mode (broad-write steps: implementer, build-fixer, code-fixer, etc.):
 *   - Pre-check: git status --porcelain -z --no-renames → list changed paths.
 *   - Violation detection: findWriteScopeViolations → halt if any forbidden path changed.
 *   - Status spawn failure / non-zero exit → fail-closed halt.
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
    const managed = pipelineManagedPaths(slug);
    const stagePaths = [...new Set([...filePaths, ...managed])];

    // Nothing to stage — skip entirely (no-op equivalent to empty stage).
    if (stagePaths.length === 0) return;

    // Stage only the declared paths. Failure → halt.
    const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ...stagePaths]);
    if (!addResult.ok || addResult.exitCode !== 0) {
      throw commitEffectFailedError(step.name, branch, "stage", `exit code ${addResult.exitCode}`);
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
      throw writeScopeViolationError(step.name, branch, violations);
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

  // Stage all changes
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
