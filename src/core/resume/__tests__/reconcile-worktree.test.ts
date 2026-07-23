/**
 * Unit tests for reconcile-worktree module.
 *
 * TC-006: isReconcilableArtifact returns true for a step-result file under the change folder
 * TC-007: isReconcilableArtifact returns false for every path in protectedCanonPaths
 * TC-008: isReconcilableArtifact returns false for every path in pipelineManagedPaths
 * TC-009: isReconcilableArtifact returns false for a non-change-folder path (src/)
 * TC-010: isReconcilableArtifact returns false for a same-prefix-different-directory path
 * TC-011: reconcileWorktreeArtifacts returns no-op result on a clean worktree
 * TC-012: reconcileWorktreeArtifacts returns no-op on git status failure or spawn rejection
 *
 * Uses the mocked SpawnFn harness pattern from apply-canon.test.ts.
 */

import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import type { SpawnFn } from "../../../util/git-exec.js";
import { protectedCanonPaths } from "../../step/write-scope.js";
import { pipelineManagedPaths } from "../../pipeline/round-git-scope.js";
import { isReconcilableArtifact, reconcileWorktreeArtifacts } from "../reconcile-worktree.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "foo-bar";
const CHANGE_FOLDER = `specrunner/changes/${SLUG}`;

// ---------------------------------------------------------------------------
// Mock SpawnFn helpers
// ---------------------------------------------------------------------------

/**
 * Build a SpawnFn that returns fake ChildProcess instances.
 * Each call consumes the next entry from `responses`.
 * `calls` accumulates the args[] passed to each call for assertion.
 */
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

/**
 * SpawnFn that rejects immediately (simulates spawn failure / ENOENT).
 */
function makeRejectingSpawnFn(): SpawnFn {
  return (_bin: string, _args: string[], _opts: SpawnOptions): ChildProcess => {
    const proc = new EventEmitter() as unknown as ChildProcess;
    const stdoutEE = new EventEmitter();
    const stderrEE = new EventEmitter();
    proc.stdout = stdoutEE as never;
    proc.stderr = stderrEE as never;
    proc.stdin = { end: () => {} } as never;
    setImmediate(() => {
      proc.emit("error", new Error("ENOENT: spawn git failed"));
    });
    return proc;
  };
}

/**
 * Build NUL-delimited git status output string.
 * Format per entry: "XY PATH" (2-char status + space + path).
 */
function makeStatusOutput(entries: string[]): string {
  return entries.map((e) => e + "\0").join("");
}

// ---------------------------------------------------------------------------
// TC-006: isReconcilableArtifact returns true for step-result file under change folder
// ---------------------------------------------------------------------------

describe("TC-006: isReconcilableArtifact returns true for a step-result file under the change folder", () => {
  it("TC-006: returns true for spec-review-result-002.md under the change folder", () => {
    // GIVEN
    const path = `${CHANGE_FOLDER}/spec-review-result-002.md`;
    // WHEN
    const result = isReconcilableArtifact(path, SLUG);
    // THEN
    expect(result).toBe(true);
  });

  it("TC-006: returns true for any step-result file under the change folder", () => {
    const stepResultFiles = [
      `${CHANGE_FOLDER}/spec-review-result-001.md`,
      `${CHANGE_FOLDER}/conformance-result-003.md`,
      `${CHANGE_FOLDER}/code-review-result-002.md`,
      `${CHANGE_FOLDER}/verification-result-001.md`,
      `${CHANGE_FOLDER}/adr-gen-result-001.md`,
    ];
    for (const path of stepResultFiles) {
      expect(isReconcilableArtifact(path, SLUG), `expected true for ${path}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-007: isReconcilableArtifact returns false for every path in protectedCanonPaths
// ---------------------------------------------------------------------------

describe("TC-007: isReconcilableArtifact returns false for every path in protectedCanonPaths", () => {
  it("TC-007: returns false for each protectedCanonPath", () => {
    // GIVEN: all protected canon paths for the slug
    const canonPaths = protectedCanonPaths(SLUG);
    expect(canonPaths.length).toBeGreaterThan(0);

    // WHEN / THEN: each path must return false
    for (const path of canonPaths) {
      expect(
        isReconcilableArtifact(path, SLUG),
        `expected false for protected canon path: ${path}`,
      ).toBe(false);
    }
  });

  it("TC-007: specifically returns false for spec.md, design.md, tasks.md, test-cases.md, request.md", () => {
    const specificPaths = [
      `${CHANGE_FOLDER}/request.md`,
      `${CHANGE_FOLDER}/spec.md`,
      `${CHANGE_FOLDER}/design.md`,
      `${CHANGE_FOLDER}/tasks.md`,
      `${CHANGE_FOLDER}/test-cases.md`,
    ];
    for (const path of specificPaths) {
      expect(
        isReconcilableArtifact(path, SLUG),
        `expected false for canon path: ${path}`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-008: isReconcilableArtifact returns false for every path in pipelineManagedPaths
// ---------------------------------------------------------------------------

describe("TC-008: isReconcilableArtifact returns false for every path in pipelineManagedPaths", () => {
  it("TC-008: returns false for each pipelineManagedPath", () => {
    // GIVEN: all pipeline-managed paths for the slug
    const managedPaths = pipelineManagedPaths(SLUG);
    expect(managedPaths.length).toBeGreaterThan(0);

    // WHEN / THEN: each path must return false
    for (const path of managedPaths) {
      expect(
        isReconcilableArtifact(path, SLUG),
        `expected false for pipeline-managed path: ${path}`,
      ).toBe(false);
    }
  });

  it("TC-008: specifically returns false for state.json, events.jsonl, usage.json, bite-evidence-result.md, pr-create-result.md", () => {
    const specificPaths = [
      `${CHANGE_FOLDER}/state.json`,
      `${CHANGE_FOLDER}/events.jsonl`,
      `${CHANGE_FOLDER}/usage.json`,
      `${CHANGE_FOLDER}/bite-evidence-result.md`,
      `${CHANGE_FOLDER}/pr-create-result.md`,
    ];
    for (const path of specificPaths) {
      expect(
        isReconcilableArtifact(path, SLUG),
        `expected false for pipeline-managed path: ${path}`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-009: isReconcilableArtifact returns false for a non-change-folder path (src/)
// ---------------------------------------------------------------------------

describe("TC-009: isReconcilableArtifact returns false for a non-change-folder path (src/)", () => {
  it("TC-009: returns false for src/foo.ts", () => {
    // GIVEN
    const path = "src/foo.ts";
    // WHEN
    const result = isReconcilableArtifact(path, SLUG);
    // THEN
    expect(result).toBe(false);
  });

  it("TC-009: returns false for paths outside the change folder", () => {
    const outsidePaths = [
      "src/core/resume/apply-canon.ts",
      "tests/foo.test.ts",
      "README.md",
      "package.json",
      "specrunner/project.md",
    ];
    for (const path of outsidePaths) {
      expect(
        isReconcilableArtifact(path, SLUG),
        `expected false for non-change-folder path: ${path}`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-010: isReconcilableArtifact returns false for same-prefix-different-directory path
// ---------------------------------------------------------------------------

describe("TC-010: isReconcilableArtifact returns false for a same-prefix-different-directory path", () => {
  it("TC-010: returns false for specrunner/changes/foo-bar-other/x.md (same prefix, different slug)", () => {
    // GIVEN: path starts with the same prefix as the change folder but is a different directory
    const path = `specrunner/changes/${SLUG}-other/x.md`;
    // WHEN
    const result = isReconcilableArtifact(path, SLUG);
    // THEN: must be false — same-prefix-different-dir guard
    expect(result).toBe(false);
  });

  it("TC-010: returns false for specrunner/changes/foo-bar-extra/y.md (extended slug prefix)", () => {
    const path = `specrunner/changes/${SLUG}-extra/y.md`;
    expect(isReconcilableArtifact(path, SLUG)).toBe(false);
  });

  it("TC-010: returns true for the exact change folder path (not a prefix confusion)", () => {
    // Confirm the correct slug does return true for a step-result file
    const path = `specrunner/changes/${SLUG}/some-result-001.md`;
    expect(isReconcilableArtifact(path, SLUG)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-011: reconcileWorktreeArtifacts returns no-op result on a clean worktree
// ---------------------------------------------------------------------------

describe("TC-011: reconcileWorktreeArtifacts returns no-op result on a clean worktree", () => {
  it("TC-011: returns { reconciled: [], quarantineDir: null } when git status returns empty output", async () => {
    // GIVEN: mocked git status returns empty output (clean worktree) with exit code 0
    const { fn, calls } = makeGitSpawnFn([{ exitCode: 0, stdout: "" }]);
    // WHEN
    const result = await reconcileWorktreeArtifacts(SLUG, "/fake/worktree", fn);
    // THEN
    expect(result).toEqual({ reconciled: [], quarantineDir: null });
    // AND no quarantine/removal git commands were issued (only git status was called)
    const statusCalls = calls.filter((c) => c.includes("status"));
    expect(statusCalls).toHaveLength(1);
    // No git clean, checkout, rm commands should have been issued
    const removalCalls = calls.filter((c) =>
      c.includes("clean") || c.includes("checkout") || c.includes("rm"),
    );
    expect(removalCalls).toHaveLength(0);
  });

  it("TC-011: returns no-op result when git status output is only NUL bytes (no entries)", async () => {
    // GIVEN: output with only separator bytes — no actual entries
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: "\0" }]);
    // WHEN
    const result = await reconcileWorktreeArtifacts(SLUG, "/fake/worktree", fn);
    // THEN
    expect(result).toEqual({ reconciled: [], quarantineDir: null });
  });

  it("TC-011: returns no-op result when worktree has only non-reconcilable dirty files (src/)", async () => {
    // GIVEN: only src/ files are dirty — none are reconcilable artifacts
    const { fn, calls } = makeGitSpawnFn([
      { exitCode: 0, stdout: makeStatusOutput([" M src/foo.ts", " M src/bar.ts"]) },
    ]);
    // WHEN
    const result = await reconcileWorktreeArtifacts(SLUG, "/fake/worktree", fn);
    // THEN: no reconcilable artifacts found → no-op
    expect(result).toEqual({ reconciled: [], quarantineDir: null });
    // No removal commands
    const removalCalls = calls.filter((c) =>
      c.includes("clean") || c.includes("checkout") || c.includes("rm"),
    );
    expect(removalCalls).toHaveLength(0);
  });

  it("TC-011: returns no-op result when worktree has only pipeline-managed dirty files (state.json)", async () => {
    // GIVEN: only state.json (pipeline-managed) is dirty
    const stateJsonPath = `${CHANGE_FOLDER}/state.json`;
    const { fn } = makeGitSpawnFn([
      { exitCode: 0, stdout: makeStatusOutput([` M ${stateJsonPath}`]) },
    ]);
    // WHEN
    const result = await reconcileWorktreeArtifacts(SLUG, "/fake/worktree", fn);
    // THEN: state.json is not reconcilable → no-op
    expect(result).toEqual({ reconciled: [], quarantineDir: null });
  });
});

// ---------------------------------------------------------------------------
// TC-012: reconcileWorktreeArtifacts returns no-op on git status failure or spawn rejection
// ---------------------------------------------------------------------------

describe("TC-012: reconcileWorktreeArtifacts returns no-op on git status failure or spawn rejection", () => {
  it("TC-012a: returns no-op (does not throw) when git status exits non-zero", async () => {
    // GIVEN: git status exits with non-zero (e.g. repo corruption)
    const { fn } = makeGitSpawnFn([{ exitCode: 128, stderr: "not a git repository" }]);
    // WHEN
    const result = await reconcileWorktreeArtifacts(SLUG, "/fake/not-a-repo", fn);
    // THEN: returns no-op, does NOT throw (D7: detection is best-effort)
    expect(result).toEqual({ reconciled: [], quarantineDir: null });
  });

  it("TC-012b: returns no-op (does not throw) when git status exits with exit code 1", async () => {
    // GIVEN
    const { fn } = makeGitSpawnFn([{ exitCode: 1, stderr: "error" }]);
    // WHEN
    const result = await reconcileWorktreeArtifacts(SLUG, "/fake/worktree", fn);
    // THEN: no-op result, no throw
    expect(result).toEqual({ reconciled: [], quarantineDir: null });
  });

  it("TC-012c: returns no-op (does not throw) when the spawn itself rejects (ENOENT)", async () => {
    // GIVEN: spawn fails with an error event (simulates ENOENT / git not found)
    const fn = makeRejectingSpawnFn();
    // WHEN
    let threw = false;
    let result: { reconciled: string[]; quarantineDir: string | null } | undefined;
    try {
      result = await reconcileWorktreeArtifacts(SLUG, "/fake/worktree", fn);
    } catch {
      threw = true;
    }
    // THEN: must NOT throw — spawn failure is treated as best-effort no-op
    expect(threw, "reconcileWorktreeArtifacts must not throw on spawn rejection (D7)").toBe(false);
    expect(result).toEqual({ reconciled: [], quarantineDir: null });
  });

  it("TC-012: the no-op return is not the same as 'silently skip evidence' — a non-git dir has no residue", async () => {
    /**
     * D7 reasoning: a non-existent / non-git worktree cannot hold git-tracked residue.
     * So returning { reconciled: [], quarantineDir: null } is correct and safe.
     * This is intentionally different from apply-canon's fail-closed on git status failure:
     * reconcile is detection best-effort; the apply-canon gate runs separately and is fail-closed.
     */
    const { fn } = makeGitSpawnFn([{ exitCode: 128, stderr: "not a git repository" }]);
    const result = await reconcileWorktreeArtifacts(SLUG, "/fake/not-a-repo", fn);
    // The no-op result is correct: no git directory → no git residue to reconcile
    expect(result.reconciled).toHaveLength(0);
    expect(result.quarantineDir).toBeNull();
  });
});
