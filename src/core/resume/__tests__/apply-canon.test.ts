/**
 * Unit tests for detectCanonDirtyPaths and commitOperatorCanon.
 *
 * TC-009 (TC-U1): detectCanonDirtyPaths returns [] for clean worktree
 * TC-010 (TC-U2): detectCanonDirtyPaths returns only protected canon paths when mixed dirty
 * TC-011 (TC-U3): detectCanonDirtyPaths returns [] when only non-canon files are dirty
 * TC-012 (TC-U4): detectCanonDirtyPaths throws when git status exits non-zero (fail-closed)
 * TC-013 (TC-U5, TC-U6): commitOperatorCanon creates commit with correct message and returns OID
 * TC-014 (TC-U7, should): commitOperatorCanon throws when git add returns non-zero
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { detectCanonDirtyPaths, commitOperatorCanon } from "../apply-canon.js";
import { defaultSpawnFn } from "../../../util/git-exec.js";
import type { SpawnFn } from "../../../util/git-exec.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "test-apply-canon-slug";
const CANON_PATH = `specrunner/changes/${SLUG}/design.md`;
const NON_CANON_PATH = "src/feature.ts";

// ---------------------------------------------------------------------------
// Mock spawnFn helper (NUL-delimited git status output)
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
 * Build NUL-delimited git status output string.
 * Each entry is appended with NUL byte as separator.
 * Format per entry: "XY PATH" (2-char status + space + path).
 */
function makeStatusOutput(entries: string[]): string {
  // git status --porcelain -z emits each entry followed by NUL
  return entries.map((e) => e + "\0").join("");
}

// ---------------------------------------------------------------------------
// TC-009 (TC-U1): detectCanonDirtyPaths — clean worktree returns []
// ---------------------------------------------------------------------------

describe("TC-009 (TC-U1): detectCanonDirtyPaths — clean worktree returns []", () => {
  it("TC-009: returns [] when git status --porcelain -z returns empty output", async () => {
    // GIVEN: git status returns empty output (clean worktree)
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: "" }]);
    // WHEN
    const result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    // THEN
    expect(result).toEqual([]);
  });

  it("TC-009: returns [] when git status output is only NUL bytes", async () => {
    // GIVEN: output with only separator bytes (no entries)
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: "\0" }]);
    const result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    expect(result).toEqual([]);
  });

  it("TC-009: passes worktreePath as cwd to git status", async () => {
    const { fn, calls } = makeGitSpawnFn([{ exitCode: 0, stdout: "" }]);
    await detectCanonDirtyPaths(SLUG, "/my/worktree/path", fn);
    // Should call git with status --porcelain -z
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0]).toContain("status");
    expect(calls[0]).toContain("--porcelain");
  });
});

// ---------------------------------------------------------------------------
// TC-010 (TC-U2): detectCanonDirtyPaths — mixed dirty → canon paths only
// ---------------------------------------------------------------------------

describe("TC-010 (TC-U2): detectCanonDirtyPaths — mixed dirty returns only protected canon paths", () => {
  it("TC-010: returns only the canon path when both canon and non-canon files are dirty", async () => {
    // GIVEN: git status returns both a canon path (Y='M') and a non-canon path
    const statusOutput = makeStatusOutput([
      ` M ${CANON_PATH}`,     // worktree modified, not staged
      ` M ${NON_CANON_PATH}`, // non-canon, worktree modified
    ]);
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: statusOutput }]);
    // WHEN
    const result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    // THEN: only canon path is returned, non-canon is excluded
    expect(result).toContain(CANON_PATH);
    expect(result).not.toContain(NON_CANON_PATH);
  });

  it("TC-010: includes staged canon paths (X != space)", async () => {
    // GIVEN: staged modification (X='M', Y=' ')
    const statusOutput = makeStatusOutput([
      `M  ${CANON_PATH}`,     // staged, not in worktree yet
      `M  ${NON_CANON_PATH}`, // staged non-canon
    ]);
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: statusOutput }]);
    const result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    expect(result).toContain(CANON_PATH);
    expect(result).not.toContain(NON_CANON_PATH);
  });

  it("TC-010: returns all dirty protected canon paths from the full canon set", async () => {
    // GIVEN: all six protected canon paths are dirty
    const allCanonPaths = [
      `specrunner/changes/${SLUG}/request.md`,
      `specrunner/changes/${SLUG}/spec.md`,
      `specrunner/changes/${SLUG}/design.md`,
      `specrunner/changes/${SLUG}/tasks.md`,
      `specrunner/changes/${SLUG}/test-cases.md`,
      `specrunner/changes/${SLUG}/request-review-attestation.json`,
    ];
    const statusOutput = makeStatusOutput([
      ...allCanonPaths.map((p) => ` M ${p}`),
      ` M ${NON_CANON_PATH}`, // non-canon — should be excluded
    ]);
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: statusOutput }]);
    const result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    for (const cp of allCanonPaths) {
      expect(result).toContain(cp);
    }
    expect(result).not.toContain(NON_CANON_PATH);
    expect(result).toHaveLength(allCanonPaths.length);
  });

  it("TC-010: the intersection with protectedCanonPaths(slug) is the filter (not substring match)", async () => {
    // GIVEN: a path that has "design.md" in the name but is not the canon path
    const nonCanonDesign = `src/other-slug/design.md`; // not in protectedCanonPaths for SLUG
    const statusOutput = makeStatusOutput([
      ` M ${CANON_PATH}`,
      ` M ${nonCanonDesign}`,
    ]);
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: statusOutput }]);
    const result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    expect(result).toContain(CANON_PATH);
    expect(result).not.toContain(nonCanonDesign);
  });
});

// ---------------------------------------------------------------------------
// TC-011 (TC-U3): detectCanonDirtyPaths — non-canon dirty returns []
// ---------------------------------------------------------------------------

describe("TC-011 (TC-U3): detectCanonDirtyPaths — only non-canon dirty returns []", () => {
  it("TC-011: returns [] when only src/feature.ts is dirty (non-canon)", async () => {
    const statusOutput = makeStatusOutput([` M ${NON_CANON_PATH}`]);
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: statusOutput }]);
    const result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    expect(result).toEqual([]);
  });

  it("TC-011: returns [] when multiple non-canon files are dirty", async () => {
    const statusOutput = makeStatusOutput([
      ` M src/a.ts`,
      ` M src/b.ts`,
      ` M tests/c.test.ts`,
    ]);
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: statusOutput }]);
    const result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    expect(result).toEqual([]);
  });

  it("TC-011: untracked non-canon files (XY=??) are NOT included", async () => {
    // Untracked non-canon files should be excluded (X='?' Y='?' → Y='?' → not dirty per rule)
    const statusOutput = makeStatusOutput([`?? ${NON_CANON_PATH}`]);
    const { fn } = makeGitSpawnFn([{ exitCode: 0, stdout: statusOutput }]);
    const result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-012 (TC-U4): detectCanonDirtyPaths — git status fail → throw (fail-closed)
// ---------------------------------------------------------------------------

describe("TC-012 (TC-U4): detectCanonDirtyPaths — git status failure throws (fail-closed)", () => {
  it("TC-012: throws when git status exits with non-zero exit code (e.g. 128)", async () => {
    // GIVEN: git status fails (e.g. not a git repository)
    const { fn } = makeGitSpawnFn([{ exitCode: 128, stderr: "not a git repository" }]);
    // WHEN / THEN: must throw, NOT return []
    await expect(
      detectCanonDirtyPaths(SLUG, "/fake/not-a-repo", fn)
    ).rejects.toThrow();
  });

  it("TC-012: throws when git status exits with exit code 1", async () => {
    const { fn } = makeGitSpawnFn([{ exitCode: 1, stderr: "error" }]);
    await expect(
      detectCanonDirtyPaths(SLUG, "/fake/worktree", fn)
    ).rejects.toThrow();
  });

  it("TC-012: does NOT return [] on git status failure — fail-closed, not fail-safe", async () => {
    // DESTROY: reverting to '[] on failure' degrades R2 fail-closed guarantee.
    // If this test fails after removing the throw, the guard is confirmed load-bearing.
    const { fn } = makeGitSpawnFn([{ exitCode: 1, stderr: "error" }]);
    let threw = false;
    let result: string[] | undefined;
    try {
      result = await detectCanonDirtyPaths(SLUG, "/fake/worktree", fn);
    } catch {
      threw = true;
    }
    // Must throw — must NOT silently return []
    expect(threw, "detectCanonDirtyPaths must throw on git status failure (fail-closed)").toBe(true);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-013 (TC-U5, TC-U6): commitOperatorCanon — real git repo
// ---------------------------------------------------------------------------

describe("TC-013 (TC-U5, TC-U6): commitOperatorCanon — creates commit with correct message and returns OID", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apply-canon-unit-"));
    // Initialize real git repo
    spawnSync("git", ["init"], { cwd: tempDir, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "test@apply-canon.local"], { cwd: tempDir, encoding: "utf8" });
    spawnSync("git", ["config", "user.name", "Apply Canon Test"], { cwd: tempDir, encoding: "utf8" });
    // Initial commit so repo has a valid HEAD
    await fs.writeFile(path.join(tempDir, "README.md"), "# Test\n", "utf-8");
    spawnSync("git", ["add", "README.md"], { cwd: tempDir, encoding: "utf8" });
    spawnSync("git", ["commit", "-m", "initial commit"], { cwd: tempDir, encoding: "utf8" });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("TC-013 (TC-U5): creates a commit with message 'operator-apply: <slug>'", async () => {
    // GIVEN: a canon path file exists in the worktree (not staged)
    const canonDir = path.join(tempDir, "specrunner", "changes", SLUG);
    await fs.mkdir(canonDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, CANON_PATH), "# Updated design spec\n", "utf-8");

    // WHEN
    await commitOperatorCanon(SLUG, tempDir, [CANON_PATH], defaultSpawnFn);

    // THEN: commit message is exactly "operator-apply: <slug>"
    const logResult = spawnSync("git", ["log", "-1", "--format=%s"], {
      cwd: tempDir, encoding: "utf8",
    });
    expect(logResult.stdout.trim()).toBe(`operator-apply: ${SLUG}`);
  });

  it("TC-013 (TC-U6): returns a non-empty OID string", async () => {
    // GIVEN
    const canonDir = path.join(tempDir, "specrunner", "changes", SLUG);
    await fs.mkdir(canonDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, CANON_PATH), "# Design content\n", "utf-8");

    // WHEN
    const oid = await commitOperatorCanon(SLUG, tempDir, [CANON_PATH], defaultSpawnFn);

    // THEN: OID is a non-empty hex string matching HEAD
    expect(typeof oid).toBe("string");
    expect(oid.length).toBeGreaterThan(0);
    expect(oid).toMatch(/^[0-9a-f]+$/);

    const headOid = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: tempDir, encoding: "utf8",
    }).stdout.trim();
    expect(oid).toBe(headOid);
  });

  it("TC-013: git diff-tree --name-only shows only the specified canon path", async () => {
    // GIVEN: canon path and a non-canon path are both dirty; commitOperatorCanon receives only canon path
    const canonDir = path.join(tempDir, "specrunner", "changes", SLUG);
    await fs.mkdir(canonDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, CANON_PATH), "# Updated design\n", "utf-8");
    // Non-canon file: should remain unstaged after commitOperatorCanon
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, NON_CANON_PATH), "// feature code\n", "utf-8");

    // WHEN: commit only the canon path
    const oid = await commitOperatorCanon(SLUG, tempDir, [CANON_PATH], defaultSpawnFn);

    // THEN: diff-tree shows only the canon path
    const dtResult = spawnSync(
      "git", ["diff-tree", "--no-commit-id", "-r", "--name-only", oid],
      { cwd: tempDir, encoding: "utf8" },
    );
    const changedFiles = dtResult.stdout.trim().split("\n").filter(Boolean);
    expect(changedFiles).toContain(CANON_PATH);
    expect(changedFiles).not.toContain(NON_CANON_PATH);
    expect(changedFiles).toHaveLength(1);
  });

  it("TC-013: non-canon file remains dirty in worktree after commitOperatorCanon", async () => {
    // GIVEN
    const canonDir = path.join(tempDir, "specrunner", "changes", SLUG);
    await fs.mkdir(canonDir, { recursive: true });
    await fs.writeFile(path.join(tempDir, CANON_PATH), "# Design\n", "utf-8");
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
    await fs.writeFile(path.join(tempDir, NON_CANON_PATH), "// not staged\n", "utf-8");

    // WHEN
    await commitOperatorCanon(SLUG, tempDir, [CANON_PATH], defaultSpawnFn);

    // THEN: non-canon path is still dirty (in working tree)
    const statusResult = spawnSync("git", ["status", "--porcelain", "-uall"], {
      cwd: tempDir, encoding: "utf8",
    });
    expect(statusResult.stdout).toContain(NON_CANON_PATH);
  });
});

// ---------------------------------------------------------------------------
// TC-014 (TC-U7, should): commitOperatorCanon — git add failure throws
// ---------------------------------------------------------------------------

describe("TC-014 (TC-U7): commitOperatorCanon — git add failure throws", () => {
  it("TC-014: throws when git add exits non-zero", async () => {
    // GIVEN: mock spawnFn that makes git add fail
    const { fn } = makeGitSpawnFn([
      { exitCode: 1, stderr: "error: pathspec not in index" }, // git add fails
    ]);
    // WHEN / THEN
    await expect(
      commitOperatorCanon(SLUG, "/fake/worktree", [CANON_PATH], fn)
    ).rejects.toThrow();
  });

  it("TC-014: does not proceed to git commit when git add fails", async () => {
    // GIVEN: only one response (for git add); git commit is never reached
    const { fn, calls } = makeGitSpawnFn([
      { exitCode: 128 }, // git add fails
    ]);
    try {
      await commitOperatorCanon(SLUG, "/fake/worktree", [CANON_PATH], fn);
    } catch {
      // expected
    }
    // Only one git call should have been made (git add)
    const addCalls = calls.filter((c) => c.includes("add"));
    const commitCalls = calls.filter((c) => c.includes("commit"));
    expect(addCalls.length).toBe(1);
    expect(commitCalls.length).toBe(0);
  });
});
