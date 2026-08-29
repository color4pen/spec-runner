/**
 * Regression tests for reconcile-worktree exclusion behavior (TC-024).
 *
 * Covers:
 *   TC-024 (must): halt → resume でも除外対象 path が reconcile で破壊されない
 *
 * Background (from T-15 tasks.md):
 *   `reconcileWorktreeArtifacts` uses `isReconcilableArtifact` which classifies
 *   paths as reconcilable only when they are inside the change-folder for the slug.
 *   Paths outside the change folder (e.g. .github/workflows/**, vendor/**) are
 *   naturally excluded by the predicate — no additional code change is required.
 *   This test file locks that invariant as a regression guard.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { SpawnFn } from "../../../util/git-exec.js";
import { isReconcilableArtifact, reconcileWorktreeArtifacts } from "../reconcile-worktree.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "test-slug-reconcile-tc024";
const WORKTREE_PATH = "/tmp/fake-worktree-tc024";

// ---------------------------------------------------------------------------
// Mock SpawnFn
// ---------------------------------------------------------------------------

function makeGitSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: string[][] } {
  const calls: string[][] = [];
  let idx = 0;
  const fn = (_bin: string, args: string[], _opts: SpawnOptions): ChildProcess => {
    calls.push([...args]);
    const response = responses[idx++] ?? { exitCode: 0 };
    const proc = new EventEmitter() as unknown as ChildProcess;
    const stdoutEE = new EventEmitter();
    const stderrEE = new EventEmitter();
    proc.stdout = stdoutEE as never;
    proc.stderr = stderrEE as never;
    proc.stdin = { end: () => {} } as never;
    setImmediate(() => {
      if (response.stdout) stdoutEE.emit("data", Buffer.from(response.stdout));
      if (response.stderr) stderrEE.emit("data", Buffer.from(response.stderr));
      proc.emit("close", response.exitCode);
    });
    return proc;
  };
  return { fn, calls };
}

// ---------------------------------------------------------------------------
// TC-024 (part 1): isReconcilableArtifact returns false for change-folder-external paths
// ---------------------------------------------------------------------------

describe("TC-024 (unit): isReconcilableArtifact returns false for change-folder-external paths", () => {
  it(
    "TC-024a: .github/workflows/ci.yml is NOT reconcilable (outside change folder)",
    () => {
      expect(isReconcilableArtifact(".github/workflows/ci.yml", SLUG)).toBe(false);
    },
  );

  it(
    "TC-024b: vendor/generated.js is NOT reconcilable (outside change folder)",
    () => {
      expect(isReconcilableArtifact("vendor/generated.js", SLUG)).toBe(false);
    },
  );

  it(
    "TC-024c: src/index.ts is NOT reconcilable (outside change folder)",
    () => {
      expect(isReconcilableArtifact("src/index.ts", SLUG)).toBe(false);
    },
  );

  it(
    "TC-024d: change-folder step-result IS reconcilable",
    () => {
      const insideChangeFolder = `specrunner/changes/${SLUG}/spec-review-result-002.md`;
      expect(isReconcilableArtifact(insideChangeFolder, SLUG)).toBe(true);
    },
  );

  it(
    "TC-024e: different slug path is NOT reconcilable (wrong change folder)",
    () => {
      const differentSlugPath = "specrunner/changes/other-slug/spec-review-result.md";
      expect(isReconcilableArtifact(differentSlugPath, SLUG)).toBe(false);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-024 (part 2): reconcileWorktreeArtifacts does not reconcile excluded paths
// ---------------------------------------------------------------------------

describe("TC-024 (integration): reconcileWorktreeArtifacts does not delete excluded paths", () => {
  it(
    "TC-024f: .github/workflows/ci.yml in git status is NOT in reconciled list",
    async () => {
      // GIVEN: git status reports .github/workflows/ci.yml as untracked
      // (simulating a guarded step that generated an excluded file and job halted)
      const statusOut = "?? .github/workflows/ci.yml\0";
      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: statusOut }, // git status
      ]);

      // WHEN: reconcileWorktreeArtifacts runs
      const result = await reconcileWorktreeArtifacts(SLUG, WORKTREE_PATH, fn);

      // THEN: .github/workflows/ci.yml is NOT reconciled (it's outside the change folder)
      expect(result.reconciled).not.toContain(".github/workflows/ci.yml");
      expect(result.reconciled).toHaveLength(0);
      expect(result.quarantineDir).toBeNull();
    },
  );

  it(
    "TC-024g: vendor/generated.js in git status is NOT in reconciled list",
    async () => {
      const statusOut = "?? vendor/generated.js\0";
      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: statusOut },
      ]);

      const result = await reconcileWorktreeArtifacts(SLUG, WORKTREE_PATH, fn);

      expect(result.reconciled).not.toContain("vendor/generated.js");
      expect(result.reconciled).toHaveLength(0);
    },
  );

  it(
    "TC-024h: mixed status — change-folder artifact reconciled, excluded path preserved",
    async () => {
      // GIVEN: status has both a reconcilable artifact AND an excluded path
      // The reconcilable artifact inside the change folder should be reconciled;
      // the excluded path outside should NOT be touched.
      const reconcilableArtifact = `specrunner/changes/${SLUG}/spec-review-result-002.md`;
      const excludedPath = ".github/workflows/ci.yml";

      // Status output with both paths
      const statusOut = `?? ${reconcilableArtifact}\0?? ${excludedPath}\0`;

      // For quarantine, we need: git status, mkdir (no-op), git diff HEAD -- <path> (quarantine evidence)
      // then git clean -f -- <reconcilable path>
      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: statusOut },    // git status
        { exitCode: 0, stdout: "diff content" }, // git diff HEAD -- reconcilable artifact (quarantine evidence)
        { exitCode: 0 },                         // git clean -f -- reconcilable artifact
      ]);

      const result = await reconcileWorktreeArtifacts(SLUG, WORKTREE_PATH, fn);

      // THEN: only the change-folder artifact was reconciled
      expect(result.reconciled).toContain(reconcilableArtifact);
      expect(result.reconciled).not.toContain(excludedPath);

      // AND: no git clean -f was called for the excluded path
      const cleanCalls = calls.filter((c) => c[0] === "clean");
      expect(cleanCalls.every((c) => !c.includes(excludedPath))).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-024 (exclusion-patterns): non-canon path inside change folder matching
// excludePatterns is NOT reconciled — Finding 2 regression guard.
// ---------------------------------------------------------------------------
// A path like specrunner/changes/<slug>/vendor/generated.js is inside the change
// folder and would normally be classified as a reconcilable artifact by
// isReconcilableArtifact. If stagingExcludePatterns includes a matching glob,
// reconcileWorktreeArtifacts must skip it (not quarantine, not git clean -f).
//
// This scenario is distinct from TC-024a–h which test paths OUTSIDE the change
// folder (which are excluded by isReconcilableArtifact itself, independent of
// stagingExcludePatterns).

describe("TC-024 (inside-change-folder exclusion): reconcileWorktreeArtifacts respects excludePatterns", () => {
  it(
    "TC-024i: path inside change folder matching excludePatterns → NOT reconciled (preserved)",
    async () => {
      // GIVEN: a non-canon, non-managed path inside the change folder
      // that matches a stagingExcludePatterns entry
      const insideChangeFolder = `specrunner/changes/${SLUG}/vendor/generated.js`;
      const statusOut = `?? ${insideChangeFolder}\0`;
      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: statusOut }, // git status
        // No quarantine or clean calls expected
      ]);

      // WHEN: reconcileWorktreeArtifacts with excludePatterns that match the path
      const result = await reconcileWorktreeArtifacts(
        SLUG,
        WORKTREE_PATH,
        fn,
        [`specrunner/changes/*/vendor/**`], // matches the inside-change-folder path
      );

      // THEN: path is NOT reconciled — exclusion pattern preserves it in worktree
      expect(result.reconciled).not.toContain(insideChangeFolder);
      expect(result.reconciled).toHaveLength(0);
      expect(result.quarantineDir).toBeNull();
    },
  );

  it(
    "TC-024j: same inside-change-folder path WITHOUT excludePatterns → IS reconciled (regression guard)",
    async () => {
      // GIVEN: same path, no excludePatterns
      const insideChangeFolder = `specrunner/changes/${SLUG}/vendor/generated.js`;
      const statusOut = `?? ${insideChangeFolder}\0`;
      const { fn } = makeGitSpawnFn([
        { exitCode: 0, stdout: statusOut },          // git status
        { exitCode: 0, stdout: "file content" },     // git diff HEAD -- (quarantine evidence)
        { exitCode: 0 },                             // git clean -f
      ]);

      // WHEN: reconcileWorktreeArtifacts WITHOUT excludePatterns (default behavior)
      const result = await reconcileWorktreeArtifacts(SLUG, WORKTREE_PATH, fn);

      // THEN: path IS reconciled (normal behavior — no exclusion applied)
      expect(result.reconciled).toContain(insideChangeFolder);
    },
  );

  it(
    "TC-024k: mixed — inside-change-folder excluded path preserved, non-excluded reconciled",
    async () => {
      // GIVEN: two paths inside the change folder — one excluded, one not
      const excludedPath = `specrunner/changes/${SLUG}/vendor/generated.js`;
      const reconcilablePath = `specrunner/changes/${SLUG}/spec-review-result-003.md`;
      const statusOut = `?? ${excludedPath}\0?? ${reconcilablePath}\0`;

      const { fn, calls } = makeGitSpawnFn([
        { exitCode: 0, stdout: statusOut },          // git status
        { exitCode: 0, stdout: "diff content" },     // git diff HEAD -- reconcilablePath (quarantine evidence)
        { exitCode: 0 },                             // git clean -f -- reconcilablePath
      ]);

      // WHEN: reconcileWorktreeArtifacts with excludePatterns matching only the vendor path
      const result = await reconcileWorktreeArtifacts(
        SLUG,
        WORKTREE_PATH,
        fn,
        [`specrunner/changes/*/vendor/**`],
      );

      // THEN: only the non-excluded path was reconciled
      expect(result.reconciled).toContain(reconcilablePath);
      expect(result.reconciled).not.toContain(excludedPath);

      // AND: git clean -f was NOT called for the excluded path
      const cleanCalls = calls.filter((c) => c[0] === "clean");
      expect(cleanCalls.every((c) => !c.includes(excludedPath))).toBe(true);
    },
  );
});
