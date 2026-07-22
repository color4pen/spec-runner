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
import { stagingModeFor, findWriteScopeViolations, findScopedCommitViolations } from "./write-scope.js";
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
 * List the net-changed paths in the commit range base..head.
 *
 * Uses `git diff --name-only --no-renames <base> <head>`. Renames are suppressed
 * (`--no-renames`) to ensure every affected path is enumerated individually (consistent
 * with getWorktreeChangedPaths).
 *
 * Returns null on git error (non-zero exit or spawn failure) so callers can treat null
 * as fail-closed (distinct from an empty array which means the range touched no files).
 *
 * T-03 / D2: used by commitAndPushTail to inspect agent self-commit content before push.
 */
async function listCommitRangeChangedPaths(
  spawnFn: SpawnFn,
  cwd: string,
  base: string,
  head: string,
): Promise<string[] | null> {
  const result = await gitExec(spawnFn, cwd, ["diff", "--name-only", "--no-renames", base, head]);
  if (result === null) return null;
  return result
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Mode-specific context passed from commitAndPush to commitAndPushTail.
 *
 * D7: mode-dependent information (commit pathspec, violation rules) is resolved in
 * commitAndPush and forwarded as a single context object so commitAndPushTail can
 * apply the correct behavior without re-reading step or state.
 */
interface CommitTailContext {
  /** "scoped" (deterministic step) or "guarded" (broad-write step). */
  mode: "scoped" | "guarded";
  /**
   * Pathspec for staged-check and commit in scoped mode.
   * Empty in guarded mode (whole-index commit).
   * Empty in scoped mode when the step has no declared writes and no existing managed paths.
   */
  stagePaths: string[];
  /** Paths declared by step.writes() — for scoped violation check and guarded check. */
  declaredWritePaths: string[];
  /** All pipeline-managed paths (not just existing) — for scoped commit violation check. */
  managedPaths: string[];
}

/**
 * Shared tail for both scoped and guarded staging modes.
 *
 * Runs after staging and residual-violation checks are complete:
 *
 * 1. Staged-change check (mode-specific):
 *    - scoped, stagePaths non-empty: `git diff --cached --quiet -- <stagePaths>`
 *      (only checks whether the declared paths have staged changes, ignoring the rest of
 *      the index — pre-staged unauthorized files do not trigger a commit).
 *    - scoped, stagePaths empty: skip diff check (nothing in scope to stage); set
 *      hasChanges = false and proceed to HEAD-advance detection only.
 *    - guarded: `git diff --cached --quiet` (whole-index check, original behavior).
 *    - exit 0 = no staged changes, exit 1 = staged changes, exit ≥2 = git error → throws.
 *
 * 2. No staged changes path → HEAD-advance detection + agent self-commit inspection (T-05):
 *    a. `git rev-parse HEAD` to get the current HEAD SHA.
 *    b. If headBeforeStep !== HEAD (agent authored commit(s) since step start):
 *       - Enumerate changed paths in headBeforeStep..HEAD via listCommitRangeChangedPaths.
 *       - Enumerate failure (null = git error) → fail-closed: throw commitEffectFailedError.
 *       - Inspect changed paths against write-scope rules:
 *           scoped: findScopedCommitViolations (changedPaths − declaredWrites − managedPaths)
 *           guarded: findWriteScopeViolations (changed ∩ protected canon − declaredWrites)
 *       - Violations found: quarantineViolationEvidence with range {base, head}, then throw
 *         WRITE_SCOPE_VIOLATION. Push is NOT called; the violating commit remains local.
 *       - No violations: log detection and push-only (original behavior preserved).
 *    c. headBeforeStep = null or HEAD unchanged → silently return (no-op).
 *
 * 3. Staged changes path → commit + push (mode-specific):
 *    - scoped, stagePaths non-empty: `git commit -m "<step>: <slug>" -- <stagePaths>`
 *      (pathspec restricts the commit to the declared scope; pre-staged unauthorized files
 *      that are not in stagePaths are excluded from the commit, even if still in the index).
 *    - guarded: `git commit -m "<step>: <slug>"` (whole-index commit, original behavior).
 *    - Commit failure → throws commitEffectFailedError("commit").
 *    - Push with one retry → throws pushFailedError on double failure.
 */
async function commitAndPushTail(
  step: AgentStep,
  headBeforeStep: string | null,
  infra: CommitPushInfra,
  cwd: string,
  branch: string,
  slug: string,
  ctx: CommitTailContext,
): Promise<void> {
  // ── 0. Agent self-commit inspection (T-05) — BEFORE any push-capable path ──
  // The inspection guards the EFFECT (push), not a single control-flow branch:
  // an agent that self-commits a violation AND leaves staged declared changes would
  // otherwise route through the staged-commit path and have its commit carried by
  // the push uninspected. HEAD is captured here (pre-pipeline-commit) so the range
  // covers exactly the agent-authored commits.
  const headAtTailEntry = await gitExec(infra.spawnFn, cwd, ["rev-parse", "HEAD"]);
  if (headBeforeStep && headAtTailEntry && headAtTailEntry !== headBeforeStep) {
    const rangeChangedPaths = await listCommitRangeChangedPaths(
      infra.spawnFn, cwd, headBeforeStep, headAtTailEntry,
    );
    if (rangeChangedPaths === null) {
      // Enumerate failed → fail-closed: cannot verify commit safety.
      throw commitEffectFailedError(
        step.name, branch, "diff",
        "commit range path enumerate failed (git diff --name-only error)",
      );
    }
    let rangeViolations: string[];
    if (ctx.mode === "scoped") {
      rangeViolations = findScopedCommitViolations(
        slug, rangeChangedPaths, ctx.declaredWritePaths, ctx.managedPaths,
      );
    } else {
      rangeViolations = findWriteScopeViolations(
        step.name, slug, rangeChangedPaths, ctx.declaredWritePaths,
      );
    }
    if (rangeViolations.length > 0) {
      // Preserve commit diff evidence before halting. The violating commit stays
      // local (not reset) — it is evidence for operator investigation.
      const quarantinePath = await quarantineViolationEvidence(
        infra.spawnFn, cwd, slug, step.name, rangeViolations,
        { base: headBeforeStep, head: headAtTailEntry },
      );
      throw writeScopeViolationError(step.name, branch, rangeViolations, quarantinePath);
    }
  }

  // ── 1. Staged-change check (mode-specific) ──────────────────────────────
  let hasChanges: boolean;

  if (ctx.mode === "scoped" && ctx.stagePaths.length > 0) {
    // Scoped: check only within the declared pathspec — pre-staged unauthorized files
    // outside this scope are invisible to this check (T-04).
    const diffResult = await gitExecResult(infra.spawnFn, cwd, [
      "diff", "--cached", "--quiet", "--", ...ctx.stagePaths,
    ]);
    if (!diffResult.ok || diffResult.exitCode >= 2) {
      throw commitEffectFailedError(step.name, branch, "diff", `exit code ${diffResult.exitCode}`);
    }
    hasChanges = diffResult.exitCode === 1;
  } else if (ctx.mode === "scoped") {
    // Scoped with empty stagePaths: no declared scope → nothing in scope to check.
    // Skip diff entirely; go to HEAD-advance detection (T-04).
    hasChanges = false;
  } else {
    // Guarded: whole-index staged check (original behavior).
    const diffResult = await gitExecResult(infra.spawnFn, cwd, ["diff", "--cached", "--quiet"]);
    if (!diffResult.ok || diffResult.exitCode >= 2) {
      throw commitEffectFailedError(step.name, branch, "diff", `exit code ${diffResult.exitCode}`);
    }
    hasChanges = diffResult.exitCode === 1;
  }

  // ── 2. No staged changes: HEAD-advance push-as-is ──────────────────────
  // (Range inspection already ran at tail entry (step 0) — reaching here means the
  // agent's self-commits are boundary-safe.)
  if (!hasChanges) {
    if (headBeforeStep && headAtTailEntry && headAtTailEntry !== headBeforeStep) {
      stderrWrite(
        "Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is.\n",
      );
      await pushOnly(branch, cwd, step.name, infra);
      return;
    }
    // No changes and no agent self-commit — silently skip (step completed via tool, no file writes needed)
    return;
  }

  // ── 3. Staged changes present: commit + push ────────────────────────────
  const commitMessage = `${step.name}: ${slug}`;
  let commitResult;
  if (ctx.mode === "scoped" && ctx.stagePaths.length > 0) {
    // Scoped: pathspec-restricted commit — excludes any pre-staged unauthorized files
    // that are in the index but not in stagePaths (T-04).
    commitResult = await gitExecResult(infra.spawnFn, cwd, [
      "commit", "-m", commitMessage, "--", ...ctx.stagePaths,
    ]);
  } else {
    // Guarded: whole-index commit (original behavior).
    commitResult = await gitExecResult(infra.spawnFn, cwd, ["commit", "-m", commitMessage]);
  }
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
 * Captures, per violating path:
 *   - When `range` is given (self-commit violation, T-02): the diff of that path in the
 *     commit range via `git diff <base> <head> -- <path>`.
 *   - When no range (worktree violation): the tracked diff vs HEAD via
 *     `git diff HEAD -- <path>` (original behavior, unchanged).
 *   - Fallback for untracked / empty diff: the full raw file content.
 *
 * Written to the machine-local sidecar directory (.specrunner/local/<slug>/ — never
 * committed). Best-effort: returns the quarantine file path, or null on any failure.
 * Failure never blocks the halt.
 *
 * @param range - Optional commit range for self-commit violations (T-02). When provided,
 *   `git diff base head -- path` is used instead of `git diff HEAD -- path`.
 */
async function quarantineViolationEvidence(
  spawnFn: SpawnFn,
  cwd: string,
  slug: string,
  stepName: string,
  violations: string[],
  range?: { base: string; head: string } | null,
): Promise<string | null> {
  try {
    const sections: string[] = [
      `# write-scope violation evidence`,
      `step: ${stepName}`,
      `captured-at: ${new Date().toISOString()}`,
      ...(range ? [`range: ${range.base}..${range.head}`] : []),
      `paths:`,
      ...violations.map((v) => `  - ${v}`),
      "",
    ];
    for (const v of violations) {
      // Choose diff command based on whether this is a commit-range violation (T-02).
      const diffArgs = range
        ? ["diff", range.base, range.head, "--", v]
        : ["diff", "HEAD", "--", v];
      const diff = await gitExec(spawnFn, cwd, diffArgs);
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
 *   - After staging, any protected paths that remain dirty are quarantined, restored to
 *     HEAD, and WRITE_SCOPE_VIOLATION is thrown (T-06: halt, not continue).
 *     Prior behavior ("restore and continue") is removed — a step that read a contaminated
 *     canon must not have its result adopted.
 *   - If stagePaths is empty, no-op for git add and diff check; HEAD-advance detection
 *     still runs via commitAndPushTail.
 *
 * "guarded" mode (broad-write steps: implementer, build-fixer, code-fixer, etc.):
 *   - Pre-check: git status --porcelain -z --no-renames → list changed paths.
 *   - Violation detection: findWriteScopeViolations → halt if any forbidden path changed.
 *   - Status spawn failure / non-zero exit → fail-closed halt.
 *   - If violations: two-step restore (git clean -f for untracked new files; git checkout
 *     HEAD for tracked modified files) then throws WRITE_SCOPE_VIOLATION.
 *   - If no violations: git add -A → stage whole worktree (original behaviour).
 *
 * Shared tail (commitAndPushTail, both modes):
 *   - Staged-change check (mode-specific pathspec for scoped, whole-index for guarded).
 *   - If no staged changes:
 *     - Compare headBeforeStep with current HEAD.
 *     - If HEAD advanced (agent self-committed): inspect commit content (T-05):
 *         scoped: findScopedCommitViolations(declaredWrites + managedPaths)
 *         guarded: findWriteScopeViolations(protectedCanonPaths)
 *       - Violations: quarantine with commit range diff → WRITE_SCOPE_VIOLATION halt.
 *         Push is NOT called; the violating commit stays local for operator investigation.
 *       - No violations: push only (original behavior preserved).
 *     - Otherwise: silently return (no commit needed).
 *   - Commit (mode-specific: scoped uses pathspec, guarded is whole-index).
 *   - Push with one retry.
 *
 * Mode-dependent context (stagePaths, declaredWritePaths, managedPaths) is forwarded
 * to commitAndPushTail via CommitTailContext (D7).
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
    const allManagedPaths = pipelineManagedPaths(slug);
    // Filter managed paths to existing files: git add -A -- <path> fails with exit 128
    // for any pathspec that matches no file (e.g. usage.json when no usage was recorded).
    const existingManaged = await filterExistingFiles(allManagedPaths, cwd);
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

      // After scoped staging: check for protected paths that remain dirty in the worktree
      // (i.e. outside the step's declared scope). If found:
      //   1. Quarantine evidence (what the step attempted to write).
      //   2. Two-step restore: git clean -f (untracked) then git checkout HEAD (tracked).
      //   3. Throw WRITE_SCOPE_VIOLATION — halt, do NOT continue (T-06).
      //
      // A step that read a contaminated canon file cannot have its result safely adopted.
      // "Restore and continue" is rejected: it would leave the result record saying the
      // step reviewed the restored (correct) file, when it actually read the modified one.
      //
      // Asymmetry note: postStatus.ok===false → skip silently (best-effort).
      // The postStatus check is defensive (prevents cross-step misattribution); guarded
      // mode is the hard enforcement gate. But residual violations DO halt (T-06).
      const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd);
      if (postStatus.ok && postStatus.paths.length > 0) {
        const residualViolations = findWriteScopeViolations(step.name, slug, postStatus.paths, filePaths);
        if (residualViolations.length > 0) {
          // Preserve evidence before restore — the restore is mechanically required
          // (prevents checkpoint commit leakage) but must not destroy the evidence.
          const residualQuarantine = await quarantineViolationEvidence(
            infra.spawnFn, cwd, slug, step.name, residualViolations,
          );
          stderrWrite(
            `[${step.name}] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): ${residualViolations.join(", ")}` +
            (residualQuarantine ? ` — 退避先: ${residualQuarantine}` : ""),
          );
          // Two-step restore (same pattern as guarded mode):
          //   git clean -f removes newly created untracked violations (not in HEAD).
          //   git checkout HEAD restores tracked modified violations.
          await gitExecResult(infra.spawnFn, cwd, ["clean", "-f", "--", ...residualViolations]);
          await gitExecResult(infra.spawnFn, cwd, ["checkout", "HEAD", "--", ...residualViolations]);
          // Halt — do NOT proceed to commit/push with a contaminated step result.
          // Declared outputs (stagePaths) remain staged in the index; commitFinalState's
          // git add -A will include them in the checkpoint commit. This is accepted (see
          // commitFinalState docstring: "Known side effect (scoped residual halt)").
          throw writeScopeViolationError(step.name, branch, residualViolations, residualQuarantine);
        }
      }
    }

    // Build context for commitAndPushTail.
    const ctx: CommitTailContext = {
      mode: "scoped",
      stagePaths,
      declaredWritePaths: filePaths,
      managedPaths: allManagedPaths,
    };

    await commitAndPushTail(step, headBeforeStep, infra, cwd, branch, slug, ctx);
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

    // Build context for commitAndPushTail.
    const ctx: CommitTailContext = {
      mode: "guarded",
      stagePaths: [],        // guarded: whole-index commit, no pathspec needed
      declaredWritePaths,
      managedPaths: [],      // not used in guarded self-commit check
    };

    await commitAndPushTail(step, headBeforeStep, infra, cwd, branch, slug, ctx);
  }
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
 * HEAD state via git checkout HEAD before throwing. Scoped residual violations are
 * similarly restored (git clean -f + git checkout HEAD) before throwing. Therefore,
 * git add -A here does not pick up violation content — those files are already clean
 * (match HEAD).
 *
 * Known side effect (scoped residual halt): stagePaths (declared outputs) are staged
 * by commitAndPush before the residual check. When the residual halt throws, those
 * staged declared outputs remain in the index. Consequently, git add -A here picks
 * them up and they are committed as part of this checkpoint. This is accepted: the
 * step's legitimate declared outputs are preserved in the checkpoint even when a
 * residual violation aborts result adoption. The violation files themselves are
 * already restored (clean).
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

  // Stage all changes. When called after a WRITE_SCOPE_VIOLATION halt, both guarded-mode
  // and scoped-mode commitAndPush have already restored violated files to HEAD via
  // git checkout HEAD before throwing — so this git add -A does not pick up violation content.
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
