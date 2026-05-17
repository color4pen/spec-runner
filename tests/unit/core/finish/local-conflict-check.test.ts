/**
 * Unit tests for local-conflict-check.ts
 *
 * TC-LCC-1: git fetch success + merge-tree exit 0 → { ok: true }
 * TC-LCC-2: git fetch success + merge-tree exit 1 with CONFLICT lines → { ok: false, conflictPaths: [...] }
 * TC-LCC-3: git fetch non-zero exit → throws Error
 * TC-LCC-4: git fetch success + merge-tree exit 1 with no parseable paths → { ok: false, conflictPaths: [] }
 * TC-LCC-5: Multiple conflict paths extracted correctly from multi-line output
 */
import { describe, it, expect, vi } from "vitest";
import { runLocalConflictCheck } from "../../../../src/core/finish/local-conflict-check.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

const CWD = "/tmp/test-repo";
const BASE_BRANCH = "main";

// ---------------------------------------------------------------------------
// TC-LCC-1: git fetch success + merge-tree exit 0 → { ok: true }
// ---------------------------------------------------------------------------

describe("TC-LCC-1: fetch success + merge-tree exit 0 → { ok: true }", () => {
  it("returns { ok: true } when merge-tree exits 0", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "merge-tree") {
        return Promise.resolve({ exitCode: 0, stdout: "abc123def456\n", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });

    expect(result.ok).toBe(true);
  });

  it("calls git fetch origin <baseBranch> with correct args", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation(() =>
      Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
    );

    await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });

    type SpawnCall = [string, string[], object];
    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls as SpawnCall[];
    const fetchCall = calls.find(([cmd, args]) => cmd === "git" && args[0] === "fetch");
    expect(fetchCall).toBeDefined();
    expect(fetchCall![1]).toEqual(["fetch", "origin", BASE_BRANCH]);
  });

  it("calls git merge-tree --write-tree HEAD origin/<baseBranch>", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation(() =>
      Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
    );

    await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });

    type SpawnCall = [string, string[], object];
    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls as SpawnCall[];
    const mergeTreeCall = calls.find(
      ([cmd, args]) => cmd === "git" && args[0] === "merge-tree",
    );
    expect(mergeTreeCall).toBeDefined();
    expect(mergeTreeCall![1]).toEqual([
      "merge-tree",
      "--write-tree",
      "HEAD",
      `origin/${BASE_BRANCH}`,
    ]);
  });
});

// ---------------------------------------------------------------------------
// TC-LCC-2: git fetch success + merge-tree exit 1 + CONFLICT lines → { ok: false, conflictPaths }
// ---------------------------------------------------------------------------

describe("TC-LCC-2: fetch success + merge-tree exit 1 with CONFLICT lines → { ok: false, conflictPaths }", () => {
  it("returns { ok: false } with parsed conflict paths", async () => {
    const MERGE_TREE_OUTPUT = [
      "CONFLICT (content): Merge conflict in src/foo.ts",
      "CONFLICT (content): Merge conflict in src/bar.ts",
    ].join("\n");

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "merge-tree") {
        return Promise.resolve({ exitCode: 1, stdout: MERGE_TREE_OUTPUT, stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflictPaths).toContain("src/foo.ts");
      expect(result.conflictPaths).toContain("src/bar.ts");
      expect(result.conflictPaths).toHaveLength(2);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-LCC-3: git fetch non-zero exit → throws Error
// ---------------------------------------------------------------------------

describe("TC-LCC-3: git fetch non-zero exit → throws Error", () => {
  it("throws an Error when git fetch fails", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "fatal: network error" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    await expect(
      runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn }),
    ).rejects.toThrow();
  });

  it("thrown error message contains the stderr output", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 128, stdout: "", stderr: "fatal: remote not found" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    let caught: unknown;
    try {
      await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("fatal: remote not found");
  });

  it("does NOT call merge-tree when fetch fails", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "error" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    try {
      await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });
    } catch {
      // expected
    }

    type SpawnCall = [string, string[], object];
    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls as SpawnCall[];
    const mergeTreeCalls = calls.filter(
      ([cmd, args]) => cmd === "git" && args[0] === "merge-tree",
    );
    expect(mergeTreeCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-LCC-4: git fetch success + merge-tree exit 1 with no parseable paths → { ok: false, conflictPaths: [] }
// ---------------------------------------------------------------------------

describe("TC-LCC-4: merge-tree exit 1 with no parseable paths → { ok: false, conflictPaths: [] }", () => {
  it("returns { ok: false, conflictPaths: [] } when stdout has no CONFLICT lines", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "merge-tree") {
        // Non-zero exit but no CONFLICT lines in stdout
        return Promise.resolve({ exitCode: 1, stdout: "some unexpected output\n", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflictPaths).toEqual([]);
    }
  });

  it("returns { ok: false, conflictPaths: [] } when stdout is empty", async () => {
    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "merge-tree") {
        return Promise.resolve({ exitCode: 1, stdout: "", stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflictPaths).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-LCC-5: Multiple conflict paths extracted correctly from multi-line output
// ---------------------------------------------------------------------------

describe("TC-LCC-5: Multiple conflict paths extracted correctly", () => {
  it("extracts all conflict paths from multi-line merge-tree output", async () => {
    const MERGE_TREE_OUTPUT = [
      "Auto-merging src/index.ts",
      "CONFLICT (content): Merge conflict in src/index.ts",
      "Auto-merging tests/unit/foo.test.ts",
      "CONFLICT (add/add): Merge conflict in tests/unit/foo.test.ts",
      "CONFLICT (content): Merge conflict in package.json",
      "Automatic merge failed; fix conflicts and then commit the result.",
    ].join("\n");

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "merge-tree") {
        return Promise.resolve({ exitCode: 1, stdout: MERGE_TREE_OUTPUT, stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflictPaths).toContain("src/index.ts");
      expect(result.conflictPaths).toContain("tests/unit/foo.test.ts");
      expect(result.conflictPaths).toContain("package.json");
      expect(result.conflictPaths).toHaveLength(3);
    }
  });

  it("extracts modify/delete conflict paths from real git output format", async () => {
    // Real git merge-tree --write-tree output for modify/delete conflicts:
    // "CONFLICT (modify/delete): <path> deleted in <branch> and modified in HEAD.  Version HEAD of <path> left in tree."
    const MERGE_TREE_OUTPUT =
      "CONFLICT (modify/delete): src/deleted-file.ts deleted in branch-del and modified in HEAD.  Version HEAD of src/deleted-file.ts left in tree.\n";

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "merge-tree") {
        return Promise.resolve({ exitCode: 1, stdout: MERGE_TREE_OUTPUT, stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflictPaths).toContain("src/deleted-file.ts");
      expect(result.conflictPaths).toHaveLength(1);
    }
  });

  it("handles nested path (directory/file) correctly", async () => {
    const MERGE_TREE_OUTPUT =
      "CONFLICT (content): Merge conflict in src/core/finish/orchestrator.ts\n";

    const spawn: SpawnFn = vi.fn().mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "git" && args[0] === "fetch") {
        return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
      }
      if (cmd === "git" && args[0] === "merge-tree") {
        return Promise.resolve({ exitCode: 1, stdout: MERGE_TREE_OUTPUT, stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
    });

    const result = await runLocalConflictCheck({ baseBranch: BASE_BRANCH, cwd: CWD, spawn });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.conflictPaths).toEqual(["src/core/finish/orchestrator.ts"]);
    }
  });
});
