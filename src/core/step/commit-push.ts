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
import {
  pushFailedError,
  commitEffectFailedError,
  writeScopeViolationError,
  egressUnknownCommitError,
  SpecRunnerError,
  ERROR_CODES,
} from "../../errors.js";
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
 * Write a quarantine evidence file for a parallel-round HEAD guard violation.
 *
 * Called when the HEAD guard detects that a reviewer self-committed during a round.
 * Written to the machine-local sidecar directory (.specrunner/local/<slug>/ — never
 * committed). Best-effort: returns the quarantine file path, or null on any failure.
 * Failure never blocks the halt.
 */
export async function quarantineRoundHeadAdvanceEvidence(
  spawnFn: SpawnFn,
  cwd: string,
  slug: string,
  baseCommit: string,
  headCommit: string,
): Promise<string | null> {
  try {
    const dir = pathJoin(cwd, localSidecarDir(slug));
    await fsMkdir(dir, { recursive: true });
    const diffText = await gitExec(spawnFn, cwd, ["diff", baseCommit, headCommit]);
    const ts = Date.now();
    const file = pathJoin(dir, `round-head-advance-${ts}.md`);
    const content = [
      `# round HEAD guard violation`,
      `base: ${baseCommit}`,
      `head: ${headCommit}`,
      `captured-at: ${new Date().toISOString()}`,
      ``,
      diffText ? `## diff\n\`\`\`diff\n${diffText}\n\`\`\`` : `## no diff available`,
    ].join("\n");
    await fsWriteFile(file, content, "utf-8");
    return file;
  } catch {
    return null;
  }
}

/**
 * Run `git status --porcelain -z --no-renames` and return the changed paths.
 *
 * Returns { ok: true, paths } on success, { ok: false, paths: [] } on spawn failure or
 * non-zero exit. Never throws — callers treat ok:false as fail-closed.
 *
 * Parsing rules (same as LocalRuntime.listWorktreeChanges):
 *   - NUL-delimited entries: each entry is "XY PATH" (2-char status + space + path).
 *   - Entries shorter than 4 characters are skipped.
 *   - Path is extracted from entry.slice(3).
 *
 * @param worktreeOnly - When true, only paths that are dirty in the WORKTREE (Y≠' ')
 *   are returned. Pre-staged-only files (X≠' ', Y=' ') are excluded. Use this for
 *   residual violation checks after staging: pre-staged files (staged before the step
 *   ran) are not modifications made by the step and must not trigger residual halts.
 */
async function getWorktreeChangedPaths(
  spawnFn: SpawnFn,
  cwd: string,
  worktreeOnly = false,
): Promise<{ ok: boolean; paths: string[]; untracked: string[] }> {
  try {
    const { stdout, exitCode } = await runSubprocess(
      spawnFn,
      "git",
      ["status", "--porcelain", "-z", "--no-renames"],
      { cwd },
    );
    if (exitCode !== 0) {
      return { ok: false, paths: [], untracked: [] };
    }
    const parts = stdout.split("\0").filter((p) => p.length > 0);
    const paths: string[] = [];
    const untracked: string[] = [];
    for (const part of parts) {
      // Format: XY<SP>path — 2-char status + space prefix
      // part[0] = X (index/staging state), part[1] = Y (worktree state)
      if (part.length < 4) continue;
      if (worktreeOnly && part[1] === " ") continue; // skip staged-only (pre-staged) files
      const filePath = part.slice(3);
      if (filePath) {
        paths.push(filePath);
        // "??" = untracked. Restoration must route these to `git clean -f`
        // (`git checkout HEAD` cannot restore a path that is not in HEAD).
        if (part[0] === "?") untracked.push(filePath);
      }
    }
    return { ok: true, paths, untracked };
  } catch {
    return { ok: false, paths: [], untracked: [] };
  }
}

/**
 * Restore violated paths to their HEAD state, split by tracked state (D5 fail-closed).
 *
 * Untracked violations are removed with `git clean -f`; tracked ones are restored with
 * `git checkout HEAD`. The split keeps failure semantics unambiguous: running both
 * commands over all paths made `checkout` fail benignly whenever the violation set
 * contained an untracked file, which forced callers to ignore restore failures entirely.
 *
 * Throws commitEffectFailedError("restore") when a restore command fails — a failed
 * restore leaves tampered content in the worktree where resumed steps would read it,
 * so the halt must not claim the violation was restored.
 */
async function restoreViolatedPaths(
  spawnFn: SpawnFn,
  cwd: string,
  stepLabel: string,
  branch: string,
  violations: string[],
  untrackedPaths: string[],
): Promise<void> {
  const untrackedSet = new Set(untrackedPaths);
  const cleanTargets = violations.filter((p) => untrackedSet.has(p));
  const checkoutTargets = violations.filter((p) => !untrackedSet.has(p));
  if (cleanTargets.length > 0) {
    const cleanResult = await gitExecResult(spawnFn, cwd, ["clean", "-f", "--", ...cleanTargets]);
    if (!cleanResult.ok || cleanResult.exitCode !== 0) {
      throw commitEffectFailedError(
        stepLabel, branch, "restore",
        `git clean exit ${cleanResult.exitCode}; tampered paths remain in worktree: ${cleanTargets.join(", ")}`,
      );
    }
  }
  if (checkoutTargets.length > 0) {
    const checkoutResult = await gitExecResult(spawnFn, cwd, ["checkout", "HEAD", "--", ...checkoutTargets]);
    if (!checkoutResult.ok || checkoutResult.exitCode !== 0) {
      throw commitEffectFailedError(
        stepLabel, branch, "restore",
        `git checkout HEAD exit ${checkoutResult.exitCode}; tampered paths remain in worktree: ${checkoutTargets.join(", ")}`,
      );
    }
  }
}

/**
 * Preserve the content of write-scope-violating changes before they are restored.
 *
 * The violating content is evidence (what the agent attempted to write outside its
 * boundary). Restoration is mechanically required so the post-halt checkpoint commit
 * (commitFinalState: git add -- managed) cannot leak the violation to the remote branch — but
 * restoring without capture would destroy the evidence a human needs to judge the halt.
 *
 * Captures, per violating path:
 *   - When `range` is given (self-commit violation): the diff of that path in the
 *     commit range via `git diff <base> <head> -- <path>`.
 *   - When no range (worktree violation): the tracked diff vs HEAD via
 *     `git diff HEAD -- <path>` (original behavior, unchanged).
 *   - Fallback for untracked / empty diff: the full raw file content.
 *
 * Written to the machine-local sidecar directory (.specrunner/local/<slug>/ — never
 * committed). Best-effort: returns the quarantine file path, or null on any failure.
 * Failure never blocks the halt.
 *
 * @param range - Optional commit range for self-commit violations. When provided,
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
      // Choose diff command based on whether this is a commit-range violation.
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
 * Verify that all commits in the push range are recorded in the synthesizedCommits ledger.
 *
 * Runs `git rev-list HEAD --not --remotes=origin` to enumerate the set of commits that
 * would be published to origin. Each OID is checked against `ledger`
 * (synthesizedCommits ∪ current-op OIDs). Any unknown OID → throw EGRESS_UNKNOWN_COMMIT
 * and do NOT push.
 *
 * rev-list failure (non-0 exit or spawn error) → halt (fail-closed): we cannot verify
 * the publish range, so we must not push.
 *
 * @param params.cwd      - Working directory for git.
 * @param params.ledger   - Union of synthesizedCommits and current-op OIDs.
 * @param params.spawnFn  - Async spawn function (PipelineSpawnFn from spawn.ts).
 */
export async function verifyEgressLedger(params: {
  cwd: string;
  ledger: string[];
  spawnFn: PipelineSpawnFn;
}): Promise<void> {
  const { cwd, ledger, spawnFn } = params;
  const ledgerSet = new Set(ledger);

  let result: { exitCode: number | null; stdout: string; stderr: string };
  try {
    result = await spawnFn("git", ["rev-list", "HEAD", "--not", "--remotes=origin"], { cwd });
  } catch (err) {
    // Spawn failure → re-throw (fail-closed)
    throw err;
  }

  if ((result.exitCode ?? -1) !== 0) {
    throw new SpecRunnerError(
      ERROR_CODES.GIT_SUBPROCESS_FAILED,
      "Egress rev-list failed. Ensure git repository is healthy.",
      `git rev-list failed: exit ${result.exitCode}: ${result.stderr}`,
    );
  }

  const oids = result.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  for (const oid of oids) {
    if (!ledgerSet.has(oid)) {
      throw egressUnknownCommitError(oid, "");
    }
  }
}

/**
 * Inline egress verification after a pipeline-synthesized commit.
 *
 * Captures the OID of the just-created commit, unions it with the existing
 * synthesizedCommits ledger from state, then enumerates the publish range to
 * ensure every OID is accounted for.
 *
 * Publish range is `git rev-list HEAD --not --remotes=origin` — everything a push
 * would newly publish. The range is deliberately NOT narrowed by the step's entry
 * HEAD: `headBeforeStep` is re-captured live at every step (re-)entry, so after a
 * crash-and-resume an agent self-commit made in the crashed attempt becomes the
 * new entry HEAD and any entry-HEAD-based exclusion would blind the check to it.
 * Pre-existing legitimate commits are excluded because they are on origin
 * (pipeline pushes after every synthesis; operator hand-commits are hand-pushed).
 * Test environments must therefore either provide an origin remote or seed
 * `state.synthesizedCommits` with the baseline `git rev-list HEAD` OIDs.
 *
 * Uses SpawnFn (git-exec.js child-process variant) matching the infra.spawnFn already in use.
 *
 * @param synthesizedCommits - Existing synthesizedCommits ledger (from job state or caller-supplied).
 */
async function runInlineEgressCheck(
  spawnFn: SpawnFn,
  cwd: string,
  branch: string,
  synthesizedCommits: readonly string[],
): Promise<void> {
  // Capture OID of the just-synthesized commit (may be "" in tests)
  const newCommitOid = (await gitExec(spawnFn, cwd, ["rev-parse", "HEAD"])) ?? "";

  // Build ledger: existing synthesizedCommits ∪ current-op OID (filter empty strings)
  const ledger = new Set<string>([...synthesizedCommits, newCommitOid].filter(Boolean));

  // Enumerate publish range: all commits a push would newly publish.
  const revListArgs = ["rev-list", "HEAD", "--not", "--remotes=origin"];
  const revListResult = await runSubprocess(spawnFn, "git", revListArgs, { cwd });
  if (revListResult.exitCode !== 0) {
    throw new SpecRunnerError(
      ERROR_CODES.GIT_SUBPROCESS_FAILED,
      "Egress rev-list failed. Ensure git repository is healthy.",
      `git rev-list failed: exit ${revListResult.exitCode}: ${revListResult.stderr}`,
    );
  }

  const oids = revListResult.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  for (const oid of oids) {
    if (!ledger.has(oid)) {
      throw egressUnknownCommitError(oid, branch);
    }
  }
}

/**
 * Synthesis model for step commit+push.
 *
 * Replaces the inspection model (push-as-is + range inspection). Instead of pushing agent
 * self-commits and inspecting their contents, the pipeline:
 *   1. Captures current HEAD.
 *   2. Applies `git reset --mixed <headBeforeStep>` if HEAD advanced (agent self-committed).
 *      This unwinds agent commit objects from the history while preserving worktree changes.
 *   3. Enumerates actual worktree changes (guarded) or uses declared outputs (scoped).
 *   4. Stages and commits explicitly via pathspec.
 *   5. Verifies egress (publish range ⊆ synthesizedCommits ledger) before push.
 *
 * Branching on staging mode:
 *
 * "scoped" mode (deterministic steps: design, spec-review, spec-fixer, etc.):
 *   - Stages only declared outputs + pipeline-managed paths (explicit pathspec).
 *   - Residual check: any worktree path outside declared+managed scope is quarantined and
 *     WRITE_SCOPE_VIOLATION is thrown (halt, not continue).
 *   - Staged-change diff check restricted to the declared pathspec.
 *   - Commit uses the same explicit pathspec (pre-staged unauthorized files excluded).
 *
 * "guarded" mode (broad-write steps: implementer, build-fixer, code-fixer, etc.):
 *   - Runs git status to enumerate all worktree changes after reset.
 *   - findWriteScopeViolations: halt if any protected canon path was modified.
 *   - Stages all enumerated changed paths explicitly (git add -A -- <paths>).
 *   - Fallback: if no changes detected, uses `git add -A -- .` (backward compat).
 *   - Commit uses the same explicit pathspec.
 *
 * Shared tail (both modes):
 *   - Inline egress check (runInlineEgressCheck): rev-list against synthesizedCommits ledger.
 *   - pushOnly with one retry.
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

  // ── 0. Capture current HEAD ───────────────────────────────────────────────
  const headAtEntry = await gitExec(infra.spawnFn, cwd, ["rev-parse", "HEAD"]);

  // ── 1. Mixed reset: undo agent self-commits to restore synthesis base ─────
  // If the agent committed during its run (HEAD advanced beyond the step-start baseline),
  // reset --mixed brings HEAD back to headBeforeStep while keeping the worktree changes.
  // This ensures the pipeline synthesizes its own commit from the raw worktree diff.
  if (headBeforeStep && headAtEntry && headAtEntry !== headBeforeStep) {
    stderrWrite(
      `[${step.name}] synthesis: agent self-commit detected (HEAD advanced to ${headAtEntry}); ` +
      `applying mixed reset to ${headBeforeStep} to restore synthesis baseline\n`,
    );
    const resetResult = await gitExecResult(infra.spawnFn, cwd, ["reset", "--mixed", headBeforeStep]);
    if (!resetResult.ok || resetResult.exitCode !== 0) {
      throw commitEffectFailedError(step.name, branch, "stage", "git reset --mixed failed");
    }
  }

  if (mode === "scoped") {
    // ── Scoped synthesis mode ─────────────────────────────────────────────────
    const writes = step.writes?.(state, deps) ?? [];
    const filePaths = writes.filter((r) => r.artifact !== "gitState").map((r) => r.path);
    const allManagedPaths = pipelineManagedPaths(slug);
    // Filter managed paths to existing files: git add -A -- <path> fails with exit 128
    // for any pathspec that matches no file (e.g. usage.json when no usage was recorded).
    const existingManaged = await filterExistingFiles(allManagedPaths, cwd);
    const stagePaths = [...new Set([...filePaths, ...existingManaged])];

    if (stagePaths.length === 0) {
      // Nothing in scope → skip commit (no-op).
      return;
    }

    // Stage only declared paths (pathspec-limited; pre-staged unauthorized files excluded).
    const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ...stagePaths]);
    if (!addResult.ok || addResult.exitCode !== 0) {
      throw commitEffectFailedError(step.name, branch, "stage", `exit code ${addResult.exitCode}`);
    }

    // Residual check: detect worktree paths outside declared+managed scope.
    // Uses worktreeOnly=true to skip pre-staged files (X≠' ', Y=' '): those were
    // staged before the step ran and are not modifications made by this step.
    // Violated paths are quarantined (evidence) then restored to prevent checkpoint leakage.
    const postStatus = await getWorktreeChangedPaths(infra.spawnFn, cwd, true);
    if (!postStatus.ok) {
      // git status spawn failure or non-zero exit → fail-closed (D5): an uninspected
      // worktree must not proceed to commit/push.
      throw commitEffectFailedError(step.name, branch, "stage", "git status failed");
    }
    if (postStatus.paths.length > 0) {
      const residualViolations = findScopedCommitViolations(slug, postStatus.paths, filePaths, allManagedPaths);
      if (residualViolations.length > 0) {
        const residualQuarantine = await quarantineViolationEvidence(
          infra.spawnFn, cwd, slug, step.name, residualViolations,
        );
        stderrWrite(
          `[${step.name}] write-scope: 境界外の残余変更を検出・復元した (commit から除外済み): ${residualViolations.join(", ")}` +
          (residualQuarantine ? ` — 退避先: ${residualQuarantine}` : ""),
        );
        // Restore: untracked violations via clean -f, tracked via checkout HEAD.
        // Restore failure must not be silenced (D5) — restoreViolatedPaths throws.
        await restoreViolatedPaths(infra.spawnFn, cwd, step.name, branch, residualViolations, postStatus.untracked);
        throw writeScopeViolationError(step.name, branch, residualViolations, residualQuarantine);
      }
    }

    // Staged-change check (scoped pathspec only: pre-staged unauthorized files invisible here).
    const diffResult = await gitExecResult(infra.spawnFn, cwd, [
      "diff", "--cached", "--quiet", "--", ...stagePaths,
    ]);
    if (!diffResult.ok || diffResult.exitCode >= 2) {
      throw commitEffectFailedError(step.name, branch, "diff", `exit code ${diffResult.exitCode}`);
    }
    if (diffResult.exitCode === 0) {
      // No staged changes within scope — skip commit.
      return;
    }

    // Commit with explicit pathspec (excludes unauthorized pre-staged files not in stagePaths).
    const commitMessage = `${step.name}: ${slug}`;
    const commitResult = await gitExecResult(infra.spawnFn, cwd, [
      "commit", "-m", commitMessage, "--", ...stagePaths,
    ]);
    if (!commitResult.ok || commitResult.exitCode !== 0) {
      throw commitEffectFailedError(step.name, branch, "commit", `exit code ${commitResult.exitCode}`);
    }

    // Egress verification: publish range ⊆ synthesizedCommits ledger.
    await runInlineEgressCheck(infra.spawnFn, cwd, branch, state.synthesizedCommits ?? []);

    // Push with one retry.
    await pushOnly(branch, cwd, step.name, infra);
  } else {
    // ── Guarded synthesis mode ────────────────────────────────────────────────
    // List all changed paths in the worktree (post-reset: reflects actual agent output).
    const statusResult = await getWorktreeChangedPaths(infra.spawnFn, cwd);
    if (!statusResult.ok) {
      // git status spawn failure or non-zero exit → fail-closed.
      throw commitEffectFailedError(step.name, branch, "stage", "git status failed");
    }
    const changedPaths = statusResult.paths;

    // Resolve declared write paths for the violation allowlist.
    const writes = step.writes?.(state, deps) ?? [];
    const declaredWritePaths = writes.filter((r) => r.artifact !== "gitState").map((r) => r.path);

    // Write-scope violation check: halt if any protected canon path was modified.
    const violations = findWriteScopeViolations(step.name, slug, changedPaths, declaredWritePaths);
    if (violations.length > 0) {
      const quarantinePath = await quarantineViolationEvidence(
        infra.spawnFn, cwd, slug, step.name, violations,
      );
      // Restore before halting so the worktree does not keep violation content that
      // resumed steps would read (untracked → clean -f, tracked → checkout HEAD).
      // Restore failure must not be silenced (D5) — restoreViolatedPaths throws.
      await restoreViolatedPaths(infra.spawnFn, cwd, step.name, branch, violations, statusResult.untracked);
      throw writeScopeViolationError(step.name, branch, violations, quarantinePath);
    }

    // Stage all changed paths explicitly via pathspec.
    // When changedPaths is empty (git status found no changes), skip add entirely:
    // there is nothing to stage, and the diff check below will confirm no staged changes.
    // The previous fallback `["add", "-A", "--", "."]` was equivalent to bare `git add -A`
    // (root pathspec = whole repo) and violated F-004 (explicit pathspec required). (Finding 3)
    if (changedPaths.length > 0) {
      const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ...changedPaths]);
      if (!addResult.ok || addResult.exitCode !== 0) {
        throw commitEffectFailedError(step.name, branch, "stage", `exit code ${addResult.exitCode}`);
      }
    }

    // Staged-change check (whole-index).
    const diffResult = await gitExecResult(infra.spawnFn, cwd, ["diff", "--cached", "--quiet"]);
    if (!diffResult.ok || diffResult.exitCode >= 2) {
      throw commitEffectFailedError(step.name, branch, "diff", `exit code ${diffResult.exitCode}`);
    }
    if (diffResult.exitCode === 0) {
      // No staged changes — nothing to commit.
      return;
    }

    // Commit with explicit pathspec — never fall back to a whole-index commit.
    // changedPaths is non-empty here: an empty enumeration skips the add above and the
    // whole-index diff check returns early. If this invariant is ever broken, fail closed
    // rather than committing an index we did not enumerate (a bare commit would sweep in
    // pre-staged unauthorized entries).
    const commitMessage = `${step.name}: ${slug}`;
    if (changedPaths.length === 0) {
      throw commitEffectFailedError(step.name, branch, "commit", "staged changes present but enumeration is empty");
    }
    const commitResult = await gitExecResult(infra.spawnFn, cwd, ["commit", "-m", commitMessage, "--", ...changedPaths]);
    if (!commitResult.ok || commitResult.exitCode !== 0) {
      throw commitEffectFailedError(step.name, branch, "commit", `exit code ${commitResult.exitCode}`);
    }

    // Egress verification: publish range ⊆ synthesizedCommits ledger.
    await runInlineEgressCheck(infra.spawnFn, cwd, branch, state.synthesizedCommits ?? []);

    // Push with one retry.
    await pushOnly(branch, cwd, step.name, infra);
  }
}

/**
 * Commit final pipeline state to the feature branch (checkpoint or finalize).
 *
 * D5 (remote-checkpoint-publish-attach-closure): called after terminal transitions.
 * - awaiting-archive: messageLabel = "finalize" (existing behavior, unchanged).
 * - awaiting-resume:  messageLabel = "checkpoint".
 *
 * Stages only pipeline-managed paths (state.json, events.jsonl, usage.json,
 * bite-evidence-result.md) using a per-path `git add -- <path>` loop (exit codes ignored
 * to tolerate non-existent optional paths). Then commits with an explicit pathspec
 * (`git commit -- <managedPaths>`) so pre-staged unauthorized files cannot leak into the
 * checkpoint/finalize commit. This replaces the previous bare `git add -A`
 * which could inadvertently include agent uncommitted work or pre-staged unauthorized files.
 *
 * Agent uncommitted work is intentionally left in the worktree for local resume continuity.
 *
 * D4 (egress-backstop): after committing, the new commit OID is unioned with the existing
 * synthesizedCommits ledger and passed to verifyEgressLedger before push. If the egress check
 * fails (unknown commits in the publish range), the push is skipped and a warning is emitted.
 * The best-effort semantics are preserved — neither commit failures nor egress failures throw.
 *
 * Commits if staged changes are present, then pushes with one retry.
 * Push failures warn on stderr but do NOT throw — local resume is preserved.
 *
 * @param params.messageLabel       - Optional commit message label. Defaults to "finalize".
 * @param params.synthesizedCommits - Existing synthesizedCommits ledger from job state.
 *                                    Used as the base for egress verification (D4).
 */
export async function commitFinalState(params: {
  cwd: string;
  branch: string;
  slug: string;
  spawnFn: PipelineSpawnFn;
  messageLabel?: string;
  synthesizedCommits?: string[];
}): Promise<void> {
  const { cwd, branch, slug, spawnFn, messageLabel = "finalize", synthesizedCommits } = params;

  const managedPaths = pipelineManagedPaths(slug);

  // Stage each pipeline-managed path individually; record which paths were staged successfully.
  //
  // Per-path staging is used instead of a single `git add -- <all-paths>` call because:
  //   - `git add -- <path>` exits 128 for any path that doesn't exist and isn't tracked,
  //     which would abort the entire add and leave nothing staged.
  //   - Optional pipeline outputs (events.jsonl, usage.json, bite-evidence-result.md)
  //     may not have been written in every run.
  //
  // Paths where `git add` succeeds (exit 0) are recorded in `stagedPaths` for use as
  // the commit pathspec — ensuring only successfully-staged managed files enter the commit
  // and pre-staged unauthorized files (adversarially placed in the index) are excluded.
  const stagedPaths: string[] = [];
  for (const p of managedPaths) {
    const addResult = await spawnFn("git", ["add", "--", p], { cwd });
    if ((addResult.exitCode ?? 1) === 0) {
      stagedPaths.push(p);
    }
  }

  // Nothing managed could be staged → nothing to commit. Never fall back to a bare
  // commit here: with an empty managed pathspec the only staged content could be
  // pre-staged unauthorized entries, and a whole-index commit would sweep them in.
  if (stagedPaths.length === 0) {
    return;
  }

  // Check for staged changes within the managed pathspec only (exit 1 = changes present,
  // exit 0 = clean). Whole-index diff would report exit 1 for pre-staged unauthorized
  // entries even when no managed file changed.
  const diffResult = await spawnFn("git", ["diff", "--cached", "--quiet", "--", ...stagedPaths], { cwd });
  if ((diffResult.exitCode ?? 0) !== 1) {
    // No staged changes in managed paths — nothing to commit.
    return;
  }

  // Commit managed-paths state snapshot.
  // Explicit pathspec (-- stagedPaths) prevents pre-staged unauthorized files from leaking
  // into the checkpoint/finalize commit. git commit with pathspec only commits staged changes
  // matching the listed paths; other staged content stays in the index but is NOT included
  // in this commit. Paths that failed to add (non-existent optionals) are excluded from
  // stagedPaths and therefore absent from the commit pathspec, avoiding git exit 1.
  const commitResult = await spawnFn("git", ["commit", "-m", `${messageLabel}: ${slug}`, "--", ...stagedPaths], { cwd });
  if ((commitResult.exitCode ?? 1) !== 0) {
    stderrWrite(`Warning: ${messageLabel} commit failed for ${slug}. Push manually to ensure state is on the branch.`);
    return;
  }

  // D4: Egress verification before push (T-05).
  // Build ledger: existing synthesizedCommits ∪ this commit's OID.
  // Design note: terminal path — in-memory union is sufficient; no need to persist the OID.
  try {
    const oidResult = await spawnFn("git", ["rev-parse", "HEAD"], { cwd });
    const newOid = (oidResult.exitCode ?? 1) === 0 ? oidResult.stdout.trim() : "";
    const ledger = [...(synthesizedCommits ?? []), ...(newOid ? [newOid] : [])];
    await verifyEgressLedger({ cwd, ledger, spawnFn });
  } catch (err) {
    stderrWrite(
      `Warning: ${messageLabel} egress check failed for ${slug}: ${err instanceof Error ? err.message : String(err)}. ` +
        `Skipping push to prevent unauthorized commit publication.`,
    );
    return;
  }

  // Push with one retry (best-effort — don't throw on failure).
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
 *   3. `git diff --cached --quiet -- <stagePaths...>` (pathspec-limited):
 *      - exit 0 → no staged changes in scope → no-op (nothing was changed in the declared paths).
 *      - exit 1 → staged changes → commit then push.
 *      - ≥2 or spawn failure → throws commitEffectFailedError("diff").
 *   4. `git commit -m <commitMessage> -- <stagePaths...>` (pathspec-limited):
 *      failure throws commitEffectFailedError("commit").
 *   5. `pushOnly` (one retry on failure, throws pushFailedError on double failure).
 *
 * @param stagePaths    - Worktree-relative paths to stage (must all be declared outputs).
 * @param cwd           - Working directory for git commands.
 * @param branch        - Branch to push to.
 * @param commitMessage - Commit message (typically "<coordinator>: <slug>").
 * @param infra         - Commit/push infrastructure (spawnFn, sleepFn, events).
 * @param egress        - Optional D4 egress check params. When provided, runs
 *                        runInlineEgressCheck after commit and before push.
 *                        synthesizedCommits: existing ledger from job state.
 */
export async function commitScopedPaths(
  stagePaths: string[],
  cwd: string,
  branch: string,
  commitMessage: string,
  infra: CommitPushInfra,
  egress?: { synthesizedCommits: readonly string[] },
): Promise<void> {
  if (stagePaths.length === 0) return;

  // Stage only the declared paths (pathspec-limited; never `git add -A` without pathspec).
  // Failure (spawn error or exit≠0) throws typed error → halt path.
  const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ...stagePaths]);
  if (!addResult.ok || addResult.exitCode !== 0) {
    throw commitEffectFailedError(commitMessage, branch, "stage", `exit code ${addResult.exitCode}`);
  }

  // Check if there are staged changes within the declared pathspec only.
  // exit 0 = no staged changes; exit 1 = staged changes present;
  // ≥2 (or spawn failure) = git error → throws typed error → halt path.
  // Whole-index diff would report pre-staged unauthorized entries as changes.
  const diffResult = await gitExecResult(infra.spawnFn, cwd, ["diff", "--cached", "--quiet", "--", ...stagePaths]);
  if (!diffResult.ok || diffResult.exitCode >= 2) {
    throw commitEffectFailedError(commitMessage, branch, "diff", `exit code ${diffResult.exitCode}`);
  }
  const hasChanges = diffResult.exitCode === 1;
  if (!hasChanges) return;

  // Commit with explicit pathspec — a bare commit would sweep pre-staged unauthorized
  // index entries into the round commit. Failure throws typed error → never falls
  // through to push.
  const commitResult = await gitExecResult(infra.spawnFn, cwd, ["commit", "-m", commitMessage, "--", ...stagePaths]);
  if (!commitResult.ok || commitResult.exitCode !== 0) {
    throw commitEffectFailedError(commitMessage, branch, "commit", `exit code ${commitResult.exitCode}`);
  }

  // D4 backstop: egress verification before push (when caller supplies egress params).
  // Verifies publish range ⊆ synthesizedCommits ∪ current commit OID.
  if (egress) {
    await runInlineEgressCheck(infra.spawnFn, cwd, branch, egress.synthesizedCommits);
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
