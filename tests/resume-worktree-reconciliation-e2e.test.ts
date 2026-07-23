/**
 * Integration / E2E tests for resume worktree reconciliation.
 *
 * Uses real git repos in $TMPDIR to verify the full reconcile flow.
 *
 * TC-001: Interrupted residue is quarantined, removed, and the next step passes
 * TC-002: No residue → reconcile is a no-op (idempotent)
 * TC-003: state.json and src/ dirt survive reconcile while residue is removed
 * TC-004: Quarantine failure halts resume with the residue intact
 * TC-005: Dirty canon fail-closes before reconcile runs
 * TC-013 (should): Removal kind dispatch — untracked removed via clean, tracked-modified restored via checkout HEAD
 *
 * TC-001 through TC-005, TC-013 use real git repos (no mocking of git operations).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { reconcileWorktreeArtifacts } from "../src/core/resume/reconcile-worktree.js";
import { findScopedCommitViolations, findWriteScopeViolations } from "../src/core/step/write-scope.js";
import { pipelineManagedPaths } from "../src/core/pipeline/round-git-scope.js";
import { defaultSpawnFn } from "../src/util/git-exec.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "resume-worktree-reconciliation-test-slug";
const CHANGE_FOLDER = `specrunner/changes/${SLUG}`;

// ---------------------------------------------------------------------------
// Git sync helpers
// ---------------------------------------------------------------------------

function gitSync(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return (result.stdout ?? "").trim();
}

async function createGitRepo(dir: string): Promise<void> {
  gitSync(["init"], dir);
  gitSync(["config", "user.email", "e2e-reconcile@spec-runner.local"], dir);
  gitSync(["config", "user.name", "Reconcile E2E Test"], dir);
}

/**
 * Make an initial commit and return the HEAD OID.
 */
async function makeInitialCommit(repoDir: string): Promise<string> {
  const readmePath = path.join(repoDir, "README.md");
  await fs.writeFile(readmePath, "# Reconcile E2E Test\n", "utf-8");
  gitSync(["add", "README.md"], repoDir);
  gitSync(["commit", "-m", "initial: test repo setup"], repoDir);
  return gitSync(["rev-parse", "HEAD"], repoDir);
}

/**
 * Get the current worktree status as a map of path → XY code.
 */
function getWorktreeStatus(repoDir: string): Map<string, string> {
  const result = spawnSync("git", ["status", "--porcelain", "-uall"], {
    cwd: repoDir,
    encoding: "utf8",
  });
  const statusMap = new Map<string, string>();
  for (const line of (result.stdout ?? "").split("\n").filter(Boolean)) {
    const xy = line.slice(0, 2);
    const filePath = line.slice(3);
    statusMap.set(filePath, xy);
  }
  return statusMap;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "reconcile-e2e-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-001: Interrupted residue is quarantined, removed, and the next step passes
// ---------------------------------------------------------------------------

describe("TC-001: interrupted residue is quarantined, removed, and the next step passes", () => {
  it(
    "TC-001: untracked residue is quarantined, removed; subsequent write-scope check reports no violation",
    async () => {
      // ── Setup: real git repo ─────────────────────────────────────────────
      const repoDir = path.join(tempDir, "repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);

      // Create feature branch
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      // Commit the change folder with a prior result file (tracked, clean)
      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      const priorResultPath = `${CHANGE_FOLDER}/spec-review-result-001.md`;
      await fs.writeFile(
        path.join(repoDir, priorResultPath),
        "# Prior spec-review result\n",
        "utf-8",
      );
      gitSync(["add", priorResultPath], repoDir);
      gitSync(["commit", "-m", `spec-review: iteration 001 for ${SLUG}`], repoDir);

      // Leave an UNTRACKED residue from an interrupted attempt (iteration 002)
      const residuePath = `${CHANGE_FOLDER}/spec-review-result-002.md`;
      const residueContent = "# Interrupted spec-review result 002\n";
      await fs.writeFile(path.join(repoDir, residuePath), residueContent, "utf-8");

      // Confirm residue is untracked before reconcile
      const statusBefore = getWorktreeStatus(repoDir);
      expect(statusBefore.has(residuePath), "residue should be untracked before reconcile").toBe(true);

      // ── WHEN: reconcileWorktreeArtifacts ─────────────────────────────────
      const result = await reconcileWorktreeArtifacts(SLUG, repoDir, defaultSpawnFn);

      // ── THEN: reconciled contains the residue path ───────────────────────
      expect(result.reconciled).toContain(residuePath);
      expect(result.quarantineDir).not.toBeNull();

      // ── THEN: residue file no longer exists in the worktree ──────────────
      const residueExists = await fs.access(path.join(repoDir, residuePath)).then(() => true).catch(() => false);
      expect(residueExists, "residue file must be removed from worktree after reconcile").toBe(false);

      // ── THEN: quarantine file with residue content exists ────────────────
      const quarantineDir = result.quarantineDir!;
      const quarantineFiles = await fs.readdir(quarantineDir);
      expect(quarantineFiles.length, "at least one quarantine evidence file must exist").toBeGreaterThan(0);
      // At least one quarantine file must contain the residue content
      let foundEvidence = false;
      for (const file of quarantineFiles) {
        const content = await fs.readFile(path.join(quarantineDir, file), "utf-8");
        if (content.includes("Interrupted spec-review result 002")) {
          foundEvidence = true;
          break;
        }
      }
      expect(foundEvidence, "quarantine evidence must contain the residue file content").toBe(true);

      // ── THEN: the tracked spec-review-result-001.md is untouched ─────────
      const priorResultExists = await fs.access(path.join(repoDir, priorResultPath)).then(() => true).catch(() => false);
      expect(priorResultExists, "prior tracked result file must remain untouched").toBe(true);
      const priorContent = await fs.readFile(path.join(repoDir, priorResultPath), "utf-8");
      expect(priorContent).toBe("# Prior spec-review result\n");

      // ── THEN: Walk the real halt path — write-scope check passes ─────────
      // Simulate: after reconcile, what changed paths would git status report?
      const statusAfter = getWorktreeStatus(repoDir);
      const changedPaths = Array.from(statusAfter.keys());

      // The residue (002) must NOT be in changed paths anymore
      expect(changedPaths).not.toContain(residuePath);

      // findScopedCommitViolations: declaring iteration 003, managed paths excluded
      // If the residue were still present it would appear as a violation
      const declared003 = [`${CHANGE_FOLDER}/spec-review-result-003.md`];
      const managed = pipelineManagedPaths(SLUG);
      const scopedViolations = findScopedCommitViolations(SLUG, changedPaths, declared003, managed);
      expect(
        scopedViolations,
        "no scoped commit violations after reconcile: residue was removed",
      ).toEqual([]);

      // findWriteScopeViolations: spec-review step declaring 003
      const writeViolations = findWriteScopeViolations("spec-review", SLUG, changedPaths, declared003);
      expect(
        writeViolations,
        "no write scope violations after reconcile: residue was removed",
      ).toEqual([]);
    },
    30000,
  );
});

// ---------------------------------------------------------------------------
// TC-002: No residue → reconcile is a no-op (idempotent)
// ---------------------------------------------------------------------------

describe("TC-002: No residue → reconcile is a no-op (idempotent)", () => {
  it(
    "TC-002: clean worktree → { reconciled: [], quarantineDir: null }, no files created",
    async () => {
      // GIVEN: real git repo with change folder committed and clean worktree
      const repoDir = path.join(tempDir, "clean-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      await fs.writeFile(
        path.join(repoDir, `${CHANGE_FOLDER}/state.json`),
        "{}",
        "utf-8",
      );
      gitSync(["add", `${CHANGE_FOLDER}/state.json`], repoDir);
      gitSync(["commit", "-m", `bootstrap: change folder for ${SLUG}`], repoDir);

      // Confirm clean worktree
      const statusBefore = getWorktreeStatus(repoDir);
      expect(statusBefore.size).toBe(0);

      // WHEN
      const result = await reconcileWorktreeArtifacts(SLUG, repoDir, defaultSpawnFn);

      // THEN: no-op result
      expect(result).toEqual({ reconciled: [], quarantineDir: null });

      // AND: no new files under .specrunner/local/<slug>/
      const sidecarBase = path.join(repoDir, ".specrunner", "local", SLUG);
      const sidecarExists = await fs.access(sidecarBase).then(() => true).catch(() => false);
      if (sidecarExists) {
        const entries = await fs.readdir(sidecarBase).catch(() => []);
        const reconcileDirs = entries.filter((e) => e.startsWith("reconcile-"));
        expect(reconcileDirs).toHaveLength(0);
      }
      // else: no sidecar dir means no quarantine created — also correct

      // AND: git status is unchanged after reconcile
      const statusAfter = getWorktreeStatus(repoDir);
      expect(statusAfter.size).toBe(0);
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-003: state.json and src/ dirt survive reconcile while residue is removed
// ---------------------------------------------------------------------------

describe("TC-003: state.json and src/ dirt survive reconcile while residue is removed", () => {
  it(
    "TC-003: only the reconcilable residue is removed; state.json and src/foo.ts remain dirty",
    async () => {
      // GIVEN: real git repo
      const repoDir = path.join(tempDir, "preserve-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      // Commit change folder with state.json
      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      await fs.mkdir(path.join(repoDir, "src"), { recursive: true });
      const stateJsonContent = '{"version":2,"status":"awaiting-resume"}';
      await fs.writeFile(path.join(repoDir, `${CHANGE_FOLDER}/state.json`), stateJsonContent, "utf-8");
      gitSync(["add", `${CHANGE_FOLDER}/state.json`], repoDir);
      gitSync(["commit", "-m", `bootstrap: change folder for ${SLUG}`], repoDir);

      // (a) Untracked residue under change folder
      const residuePath = `${CHANGE_FOLDER}/spec-review-result-002.md`;
      await fs.writeFile(path.join(repoDir, residuePath), "# Interrupted residue\n", "utf-8");

      // (b) Dirty state.json (modify it in worktree, tracked)
      const dirtyStateContent = '{"version":2,"status":"running"}';
      await fs.writeFile(path.join(repoDir, `${CHANGE_FOLDER}/state.json`), dirtyStateContent, "utf-8");

      // (c) Dirty src/foo.ts (untracked)
      await fs.writeFile(path.join(repoDir, "src/foo.ts"), "// work in progress\n", "utf-8");

      // Verify preconditions
      const statusBefore = getWorktreeStatus(repoDir);
      expect(statusBefore.has(residuePath), "residue must be untracked before reconcile").toBe(true);
      expect(
        statusBefore.has(`${CHANGE_FOLDER}/state.json`) || statusBefore.has(`${CHANGE_FOLDER}/state.json`),
        "state.json must be dirty before reconcile",
      ).toBe(true);

      // WHEN
      const result = await reconcileWorktreeArtifacts(SLUG, repoDir, defaultSpawnFn);

      // THEN: only the residue was reconciled
      expect(result.reconciled).toContain(residuePath);
      expect(result.reconciled).not.toContain(`${CHANGE_FOLDER}/state.json`);
      expect(result.reconciled).not.toContain("src/foo.ts");

      // THEN: residue is removed
      const residueExists = await fs.access(path.join(repoDir, residuePath)).then(() => true).catch(() => false);
      expect(residueExists, "residue must be removed after reconcile").toBe(false);

      // THEN: state.json remains dirty and unmodified by reconcile
      const stateJsonActual = await fs.readFile(path.join(repoDir, `${CHANGE_FOLDER}/state.json`), "utf-8");
      expect(stateJsonActual, "state.json must remain with its dirty content").toBe(dirtyStateContent);

      // THEN: src/foo.ts remains dirty and unmodified by reconcile
      const srcFooActual = await fs.readFile(path.join(repoDir, "src/foo.ts"), "utf-8");
      expect(srcFooActual, "src/foo.ts must remain with its dirty content").toBe("// work in progress\n");

      // THEN: git status still shows state.json and src/foo.ts as dirty
      const statusAfter = getWorktreeStatus(repoDir);
      const dirtyPathsAfter = Array.from(statusAfter.keys());
      // The residue must not appear
      expect(dirtyPathsAfter).not.toContain(residuePath);
      // state.json and src/foo.ts must still be dirty
      // (state.json shows as " M" or "M " in porcelain; src/foo.ts shows as "??" untracked)
      const combinedDirty = dirtyPathsAfter.join(" ");
      expect(combinedDirty).toContain("state.json");
      expect(combinedDirty).toContain("src/foo.ts");
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-004: Quarantine failure halts resume with the residue intact
// ---------------------------------------------------------------------------

describe("TC-004: Quarantine failure halts resume with the residue intact", () => {
  it(
    "TC-004: reconcileWorktreeArtifacts throws when quarantine mkdir fails; residue is intact",
    async () => {
      // GIVEN: real git repo with an untracked reconcilable residue
      const repoDir = path.join(tempDir, "quarantine-fail-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      // Commit change folder
      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      await fs.writeFile(path.join(repoDir, `${CHANGE_FOLDER}/state.json`), "{}", "utf-8");
      gitSync(["add", `${CHANGE_FOLDER}/state.json`], repoDir);
      gitSync(["commit", "-m", `bootstrap: ${SLUG}`], repoDir);

      // Leave an untracked residue
      const residuePath = `${CHANGE_FOLDER}/spec-review-result-002.md`;
      const residueContent = "# Residue that must survive quarantine failure\n";
      await fs.writeFile(path.join(repoDir, residuePath), residueContent, "utf-8");

      // Pre-create the sidecar base path as a REGULAR FILE so mkdir under it fails
      // mkdir(".specrunner/local/<slug>") will fail because .specrunner/local is now a file.
      await fs.mkdir(path.join(repoDir, ".specrunner"), { recursive: true });
      await fs.writeFile(path.join(repoDir, ".specrunner", "local"), "NOT A DIRECTORY", "utf-8");

      // WHEN: reconcileWorktreeArtifacts should throw (quarantine mkdir fails)
      let threw = false;
      try {
        await reconcileWorktreeArtifacts(SLUG, repoDir, defaultSpawnFn);
      } catch {
        threw = true;
      }

      // THEN: must throw (fail-closed on quarantine failure)
      expect(threw, "reconcileWorktreeArtifacts must throw when quarantine mkdir fails (fail-closed)").toBe(true);

      // THEN: the residue file is STILL PRESENT in the worktree (evidence preserved)
      const residueExists = await fs.access(path.join(repoDir, residuePath)).then(() => true).catch(() => false);
      expect(residueExists, "residue must NOT be removed when quarantine fails (evidence preserved)").toBe(true);

      // THEN: residue content is unchanged
      const residueActual = await fs.readFile(path.join(repoDir, residuePath), "utf-8");
      expect(residueActual).toBe(residueContent);
    },
    20000,
  );
});

// ---------------------------------------------------------------------------
// TC-005: Dirty canon fail-closes before reconcile runs
// ---------------------------------------------------------------------------

describe("TC-005: Dirty canon fail-closes before reconcile runs", () => {
  /**
   * This test verifies the ordering contract: the apply-canon gate runs BEFORE reconcile.
   * A dirty protected canon path (tasks.md) should cause the apply-canon gate to fail-close
   * without reconcile being reached.
   *
   * Since this test is at the reconcile unit level (not at ResumeCommand.prepare() level),
   * we verify the classification: a dirty canon path is NOT reconcilable (returns false from
   * isReconcilableArtifact), so reconcileWorktreeArtifacts treats it as non-reconcilable.
   *
   * The full integration of the gate ordering is verified in TC-019 (resume-reconcile.test.ts).
   */
  it(
    "TC-005: a dirty protected canon path is NOT quarantined or removed by reconcileWorktreeArtifacts",
    async () => {
      // GIVEN: real git repo with a dirty protected canon path (tasks.md)
      const repoDir = path.join(tempDir, "dirty-canon-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      // Commit the change folder with tasks.md committed
      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      const tasksPath = `${CHANGE_FOLDER}/tasks.md`;
      await fs.writeFile(path.join(repoDir, tasksPath), "# Tasks (original)\n", "utf-8");
      gitSync(["add", tasksPath], repoDir);
      gitSync(["commit", "-m", `design: initial tasks for ${SLUG}`], repoDir);

      // Dirty the protected canon path (tasks.md) — simulates operator edit
      const dirtyTasksContent = "# Tasks (operator edit — should not be touched by reconcile)\n";
      await fs.writeFile(path.join(repoDir, tasksPath), dirtyTasksContent, "utf-8");

      // Also add an untracked reconcilable residue to verify reconcile does not skip entirely
      const residuePath = `${CHANGE_FOLDER}/spec-review-result-001.md`;
      await fs.writeFile(path.join(repoDir, residuePath), "# Residue\n", "utf-8");

      // WHEN: reconcileWorktreeArtifacts runs
      const result = await reconcileWorktreeArtifacts(SLUG, repoDir, defaultSpawnFn);

      // THEN: the residue was reconciled (normal behavior)
      expect(result.reconciled).toContain(residuePath);

      // THEN: tasks.md (protected canon) was NOT touched by reconcile — still dirty
      const tasksActual = await fs.readFile(path.join(repoDir, tasksPath), "utf-8");
      expect(tasksActual, "protected canon path must NOT be modified by reconcile").toBe(dirtyTasksContent);

      // THEN: tasks.md is still dirty in git status (reconcile did not restore it)
      const statusAfter = getWorktreeStatus(repoDir);
      expect(
        statusAfter.has(tasksPath),
        "tasks.md must remain dirty after reconcile (apply-canon gate handles it separately)",
      ).toBe(true);
    },
    20000,
  );

  it(
    "TC-005: tasks.md is NOT in result.reconciled (isReconcilableArtifact returns false for canon)",
    async () => {
      // GIVEN: worktree with only a dirty canon file (no residue)
      const repoDir = path.join(tempDir, "only-canon-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      const tasksPath = `${CHANGE_FOLDER}/tasks.md`;
      await fs.writeFile(path.join(repoDir, tasksPath), "# Tasks (original)\n", "utf-8");
      gitSync(["add", tasksPath], repoDir);
      gitSync(["commit", "-m", `design: tasks for ${SLUG}`], repoDir);

      // Dirty the canon path only (no reconcilable residue)
      await fs.writeFile(path.join(repoDir, tasksPath), "# Tasks (dirty)\n", "utf-8");

      // WHEN
      const result = await reconcileWorktreeArtifacts(SLUG, repoDir, defaultSpawnFn);

      // THEN: reconcile is a no-op for canon paths — they are NOT in result.reconciled
      expect(result.reconciled).not.toContain(tasksPath);
      // Since there are no reconcilable artifacts, result is effectively no-op
      expect(result.reconciled).toHaveLength(0);
      expect(result.quarantineDir).toBeNull();
    },
    15000,
  );
});

// ---------------------------------------------------------------------------
// TC-013 (should): Removal kind dispatch
// ---------------------------------------------------------------------------

describe("TC-013 (should): removal kind dispatch — untracked, staged-new, and tracked-modified kinds", () => {
  it(
    "TC-013: untracked residue is absent after reconcile; tracked-modified non-canon artifact is restored to HEAD content",
    async () => {
      // GIVEN: real git repo
      const repoDir = path.join(tempDir, "removal-kinds-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      // Commit change folder with a tracked non-canon artifact (verification-result.md)
      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      const verificationResultPath = `${CHANGE_FOLDER}/verification-result-001.md`;
      const originalContent = "# Verification result (original HEAD content)\n";
      await fs.writeFile(path.join(repoDir, verificationResultPath), originalContent, "utf-8");
      gitSync(["add", verificationResultPath], repoDir);
      gitSync(["commit", "-m", `verification: result 001 for ${SLUG}`], repoDir);

      // (a) Untracked residue (should be removed via git clean)
      const untrackedResiduePath = `${CHANGE_FOLDER}/spec-review-result-002.md`;
      await fs.writeFile(
        path.join(repoDir, untrackedResiduePath),
        "# Untracked residue\n",
        "utf-8",
      );

      // (b) Tracked-modified non-canon artifact (should be restored via git checkout HEAD)
      const modifiedContent = "# Verification result (interrupted modification)\n";
      await fs.writeFile(path.join(repoDir, verificationResultPath), modifiedContent, "utf-8");

      // Verify preconditions
      const statusBefore = getWorktreeStatus(repoDir);
      expect(statusBefore.has(untrackedResiduePath), "untracked residue must exist before reconcile").toBe(true);
      expect(statusBefore.has(verificationResultPath), "tracked-modified artifact must be dirty before reconcile").toBe(true);

      // WHEN
      const result = await reconcileWorktreeArtifacts(SLUG, repoDir, defaultSpawnFn);

      // THEN: both paths were reconciled
      expect(result.reconciled).toContain(untrackedResiduePath);
      expect(result.reconciled).toContain(verificationResultPath);

      // THEN (a): untracked residue is absent from the worktree (removed via git clean)
      const untrackedExists = await fs
        .access(path.join(repoDir, untrackedResiduePath))
        .then(() => true)
        .catch(() => false);
      expect(untrackedExists, "untracked residue must be absent after reconcile (removed via git clean)").toBe(false);

      // THEN (b): tracked-modified artifact is restored to its HEAD content (via git checkout HEAD)
      const restoredContent = await fs.readFile(path.join(repoDir, verificationResultPath), "utf-8");
      expect(
        restoredContent,
        "tracked-modified artifact must be restored to HEAD content (via git checkout HEAD)",
      ).toBe(originalContent);

      // THEN: git status shows both as clean now
      const statusAfter = getWorktreeStatus(repoDir);
      expect(statusAfter.has(untrackedResiduePath), "untracked residue must not appear in git status after reconcile").toBe(false);
      expect(statusAfter.has(verificationResultPath), "tracked artifact must not be dirty after restore").toBe(false);
    },
    30000,
  );

  it(
    "TC-013: staged-new residue (X='A') is quarantined, unstaged, and removed from worktree",
    async () => {
      // GIVEN: real git repo
      // Simulates commit-push.ts being killed after `git add` but before `git commit`.
      const repoDir = path.join(tempDir, "staged-new-repo");
      await fs.mkdir(repoDir, { recursive: true });
      await createGitRepo(repoDir);
      await makeInitialCommit(repoDir);
      gitSync(["checkout", "-b", `fix/${SLUG}`], repoDir);

      // Commit the change folder base (state.json)
      await fs.mkdir(path.join(repoDir, CHANGE_FOLDER), { recursive: true });
      await fs.writeFile(
        path.join(repoDir, `${CHANGE_FOLDER}/state.json`),
        "{}",
        "utf-8",
      );
      gitSync(["add", `${CHANGE_FOLDER}/state.json`], repoDir);
      gitSync(["commit", "-m", `bootstrap: change folder for ${SLUG}`], repoDir);

      // Simulate the interrupted commit-push: write an artifact and git-add it,
      // but do NOT commit — leaves an X='A' staged-new entry in the index.
      const stagedResiduePath = `${CHANGE_FOLDER}/spec-review-result-003.md`;
      const residueContent = "# Staged-new residue (staged but not committed)\n";
      await fs.writeFile(path.join(repoDir, stagedResiduePath), residueContent, "utf-8");
      gitSync(["add", stagedResiduePath], repoDir);

      // Verify precondition: entry shows as "A " (staged-new) in git status
      const statusBefore = getWorktreeStatus(repoDir);
      const xyBefore = statusBefore.get(stagedResiduePath);
      expect(xyBefore, "staged-new residue must show as 'A ' in git status before reconcile").toBe("A ");

      // WHEN
      const result = await reconcileWorktreeArtifacts(SLUG, repoDir, defaultSpawnFn);

      // THEN: the staged-new path was reconciled
      expect(result.reconciled).toContain(stagedResiduePath);
      expect(result.quarantineDir).not.toBeNull();

      // THEN: the file no longer exists in the worktree
      const fileExists = await fs
        .access(path.join(repoDir, stagedResiduePath))
        .then(() => true)
        .catch(() => false);
      expect(fileExists, "staged-new residue must be removed from worktree after reconcile").toBe(false);

      // THEN: git status shows the path as completely clean (not in index, not untracked)
      const statusAfter = getWorktreeStatus(repoDir);
      expect(
        statusAfter.has(stagedResiduePath),
        "staged-new residue must not appear in git status after reconcile (index and worktree both clean)",
      ).toBe(false);

      // THEN: quarantine evidence was written and contains identifiable content
      const quarantineDir = result.quarantineDir!;
      const quarantineFiles = await fs.readdir(quarantineDir);
      expect(quarantineFiles.length, "at least one quarantine evidence file must exist").toBeGreaterThan(0);
      let foundEvidence = false;
      for (const file of quarantineFiles) {
        const content = await fs.readFile(path.join(quarantineDir, file), "utf-8");
        // Evidence contains either the raw file content or `kind: staged-new`
        if (content.includes("staged-new") || content.includes("Staged-new residue")) {
          foundEvidence = true;
          break;
        }
      }
      expect(foundEvidence, "quarantine evidence must capture staged-new residue content or kind annotation").toBe(true);
    },
    30000,
  );
});
