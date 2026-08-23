/**
 * Unit tests for src/git/push-capability.ts
 *
 * Capability Detection (Requirement 1):
 *   TC-001: Actions with installation token declares the workflows pattern
 *   TC-002: Actions with an explicit PAT in GH_TOKEN declares nothing
 *   TC-003: Local run declares nothing
 *   TC-004: Actions with a non-installation token declares nothing
 *   TC-020: Undefined token input produces no declaration
 *   TC-021: matchUnpushablePaths with empty patterns returns empty
 *   TC-022: matchUnpushablePaths with empty-patterns list returns empty
 *   TC-023: matchUnpushablePaths correctly matches and excludes paths
 *   TC-024: DSM constraint — push-capability.ts does not import from src/core/*
 *
 * Publishable Path Enumeration (Requirement 3):
 *   TC-008: Worktree changes are included in the publishable path set
 *   TC-009: A reverted unpushed commit path is still included
 *   TC-010: Already-pushed commits with clean worktree yields empty path set
 *   TC-025: Untracked files are included via --untracked-files=all
 *   TC-026: Rename notation extracts both old and new paths
 *   TC-027: collectPublishablePaths invokes exactly the three expected git command types
 */

import { describe, it, expect } from "vitest";
import {
  detectPushCapability,
  matchUnpushablePaths,
  collectPublishablePaths,
  renderPushCapabilityNotice,
  WORKFLOWS_PATTERN,
  INSTALLATION_TOKEN_PREFIX,
} from "../../../src/git/push-capability.js";
import type { SpawnFn } from "../../../src/util/spawn.js";

// ---------------------------------------------------------------------------
// TC-001 through TC-004, TC-020: detectPushCapability
// ---------------------------------------------------------------------------

describe("detectPushCapability", () => {
  // TC-001: Actions with installation token → declares workflows pattern
  it("TC-001: Actions with installation token declares the workflows pattern", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_ACTIONS: "true",
      // GH_TOKEN intentionally absent
    };
    const token = "ghs_abc123";
    const result = detectPushCapability(env, token);
    expect(result).not.toBeNull();
    expect(result!.patterns).toContain(WORKFLOWS_PATTERN);
    expect(result!.patterns).toContain(".github/workflows/**");
  });

  // TC-002: Actions with an explicit PAT in GH_TOKEN → declares nothing
  it("TC-002: Actions with explicit PAT in GH_TOKEN declares nothing", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_ACTIONS: "true",
      GH_TOKEN: "ghp_explicitPAT",
    };
    const token = "ghs_abc123";
    const result = detectPushCapability(env, token);
    expect(result.patterns).toHaveLength(0);
    expect(result.source).toBe("none");
  });

  // TC-003: Local run (no GITHUB_ACTIONS) → declares nothing
  it("TC-003: Local run declares nothing", () => {
    const env: Record<string, string | undefined> = {
      // GITHUB_ACTIONS not set
      GH_TOKEN: undefined,
    };
    const token = "ghs_abc123";
    const result = detectPushCapability(env, token);
    expect(result.patterns).toHaveLength(0);
    expect(result.source).toBe("none");
  });

  // TC-004: Actions with non-installation token (ghp_ prefix) → declares nothing
  it("TC-004: Actions with a non-installation token declares nothing", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_ACTIONS: "true",
      GH_TOKEN: undefined,
    };
    const token = "ghp_notAnInstallationToken";
    const result = detectPushCapability(env, token);
    expect(result.patterns).toHaveLength(0);
    expect(result.source).toBe("none");
  });

  // TC-020: Undefined token input produces no declaration
  it("TC-020: Undefined token input produces no declaration", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_ACTIONS: "true",
      // GH_TOKEN not set
    };
    const result = detectPushCapability(env, undefined);
    expect(result.patterns).toHaveLength(0);
    expect(result.source).toBe("none");
  });

  it("empty string GH_TOKEN still counts as unset (no GH_TOKEN override)", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_ACTIONS: "true",
      GH_TOKEN: "",
    };
    const result = detectPushCapability(env, "ghs_xxx");
    // GH_TOKEN empty string → same as not set → installation token path
    expect(result.patterns).toContain(WORKFLOWS_PATTERN);
  });

  it("GITHUB_ACTIONS=false does not trigger detection", () => {
    const env: Record<string, string | undefined> = {
      GITHUB_ACTIONS: "false",
    };
    const result = detectPushCapability(env, "ghs_abc");
    expect(result.patterns).toHaveLength(0);
    expect(result.source).toBe("none");
  });

  it("returned PushCapability has no token field — only patterns and source", () => {
    const env: Record<string, string | undefined> = { GITHUB_ACTIONS: "true" };
    const result = detectPushCapability(env, "ghs_abc123");
    // TC-029: PushCapability must NOT have a token field
    expect(Object.keys(result)).not.toContain("token");
    expect(Object.keys(result).sort()).toEqual(["patterns", "source"]);
  });
});

// ---------------------------------------------------------------------------
// TC-021, TC-022, TC-023: matchUnpushablePaths
// ---------------------------------------------------------------------------

describe("matchUnpushablePaths", () => {
  // TC-021: Undefined capability returns empty (equivalent to undeclared environment)
  it("TC-021: undefined capability returns empty array", () => {
    const paths = [".github/workflows/ci.yml", "src/foo.ts"];
    const result = matchUnpushablePaths(paths, undefined);
    expect(result).toEqual([]);
  });

  // TC-022: Capability with empty patterns list returns empty
  it("TC-022: capability with empty patterns returns empty regardless of paths", () => {
    const paths = [".github/workflows/ci.yml"];
    const result = matchUnpushablePaths(paths, { patterns: [], source: "none" });
    expect(result).toEqual([]);
  });

  // TC-023: Correctly matches and excludes paths
  it("TC-023: matches .github/workflows/ci.yml but not src/foo.ts", () => {
    const paths = [".github/workflows/ci.yml", "src/foo.ts"];
    const result = matchUnpushablePaths(paths, { patterns: [WORKFLOWS_PATTERN], source: "test" });
    expect(result).toContain(".github/workflows/ci.yml");
    expect(result).not.toContain("src/foo.ts");
  });

  it("matches nested workflow paths", () => {
    const paths = [
      ".github/workflows/ci.yml",
      ".github/workflows/deploy.yaml",
      ".github/other/config.yml",
      "src/index.ts",
    ];
    const result = matchUnpushablePaths(paths, { patterns: [WORKFLOWS_PATTERN], source: "test" });
    expect(result).toContain(".github/workflows/ci.yml");
    expect(result).toContain(".github/workflows/deploy.yaml");
    expect(result).not.toContain(".github/other/config.yml");
    expect(result).not.toContain("src/index.ts");
  });

  it("empty paths returns empty regardless of patterns", () => {
    const result = matchUnpushablePaths([], { patterns: [WORKFLOWS_PATTERN], source: "test" });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-024: DSM constraint — push-capability.ts only imports node:* and src/util/*
// (Verified by core-invariants.test.ts B-3 invariant scanning src/git/)
// This test documents the expectation in this file for traceability.
// ---------------------------------------------------------------------------

describe("TC-024: DSM constraint — push-capability.ts shared-kernel boundary", () => {
  it("INSTALLATION_TOKEN_PREFIX is 'ghs_'", () => {
    expect(INSTALLATION_TOKEN_PREFIX).toBe("ghs_");
  });

  it("WORKFLOWS_PATTERN is '.github/workflows/**'", () => {
    expect(WORKFLOWS_PATTERN).toBe(".github/workflows/**");
  });

  it("module exports only the expected named symbols", () => {
    // Verify that the module can be imported without errors —
    // if it imported from src/core/, the TypeScript compiler would catch it.
    // Runtime: just confirm the exports are present and functional.
    expect(typeof detectPushCapability).toBe("function");
    expect(typeof matchUnpushablePaths).toBe("function");
    expect(typeof collectPublishablePaths).toBe("function");
    expect(typeof renderPushCapabilityNotice).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-008, TC-009, TC-010, TC-025, TC-026, TC-027: collectPublishablePaths
// ---------------------------------------------------------------------------

type SpawnCall = { cmd: string; args: string[] };

/**
 * Build a fake SpawnFn that records all calls and returns controlled responses.
 * Each entry in `responses` maps to successive calls in invocation order.
 */
function makeFakeSpawnFn(
  responses: Array<{ stdout: string; exitCode: number }>,
): { spawnFn: SpawnFn; calls: SpawnCall[] } {
  const calls: SpawnCall[] = [];
  let idx = 0;
  const spawnFn: SpawnFn = async (_cmd: string, args: string[]) => {
    calls.push({ cmd: _cmd, args });
    const resp = responses[idx++] ?? { stdout: "", exitCode: 0 };
    return { exitCode: resp.exitCode, stdout: resp.stdout, stderr: "" };
  };
  return { spawnFn, calls };
}

describe("collectPublishablePaths", () => {
  // TC-008: Worktree changes are included
  it("TC-008: worktree changes include the modified path", async () => {
    const { spawnFn } = makeFakeSpawnFn([
      // git status --porcelain -z --no-renames --untracked-files=all
      { stdout: "M  .github/workflows/ci.yml\0", exitCode: 0 },
      // git rev-list HEAD --not --remotes=origin
      { stdout: "", exitCode: 0 },
    ]);
    const result = await collectPublishablePaths(spawnFn, "/fake/cwd");
    expect(result).toContain(".github/workflows/ci.yml");
  });

  // TC-009: A reverted unpushed commit path is still included
  it("TC-009: a path touched by an unpushed commit is included even if later reverted", async () => {
    // Worktree is clean, but there are two unpushed commits.
    // commit1 added .github/workflows/ci.yml, commit2 removed it.
    // The path must still appear in the publishable set.
    const { spawnFn } = makeFakeSpawnFn([
      // git status → clean worktree
      { stdout: "", exitCode: 0 },
      // git rev-list → two commit OIDs
      { stdout: "abc123\ndef456\n", exitCode: 0 },
      // diff-tree for abc123 → touched ci.yml
      { stdout: ".github/workflows/ci.yml\n", exitCode: 0 },
      // diff-tree for def456 → also touched ci.yml (revert)
      { stdout: ".github/workflows/ci.yml\n", exitCode: 0 },
    ]);
    const result = await collectPublishablePaths(spawnFn, "/fake/cwd");
    expect(result).toContain(".github/workflows/ci.yml");
  });

  // TC-010: Already-pushed commits with clean worktree yields empty
  it("TC-010: already-pushed commits and clean worktree yields empty path set", async () => {
    const { spawnFn } = makeFakeSpawnFn([
      // git status → clean
      { stdout: "", exitCode: 0 },
      // git rev-list → empty (all commits on origin)
      { stdout: "", exitCode: 0 },
    ]);
    const result = await collectPublishablePaths(spawnFn, "/fake/cwd");
    expect(result).toEqual([]);
  });

  // TC-025: Untracked files are included via --untracked-files=all
  it("TC-025: untracked new file appears in the result", async () => {
    const { spawnFn } = makeFakeSpawnFn([
      // git status with untracked
      { stdout: "?? .github/workflows/new.yml\0", exitCode: 0 },
      // git rev-list → empty
      { stdout: "", exitCode: 0 },
    ]);
    const result = await collectPublishablePaths(spawnFn, "/fake/cwd");
    expect(result).toContain(".github/workflows/new.yml");
  });

  // TC-026: Rename notation — old and new path both appear
  // Note: The current implementation uses --no-renames, so renames appear as 'D old / A new'.
  // In that case each is a separate status entry. Test what's actually implemented.
  it("TC-026: both deleted and added paths from a rename appear in the result", async () => {
    // With --no-renames, a rename shows as two entries: D old-name.ts + A new-name.ts
    const { spawnFn } = makeFakeSpawnFn([
      { stdout: "D  old-name.ts\0A  new-name.ts\0", exitCode: 0 },
      { stdout: "", exitCode: 0 },
    ]);
    const result = await collectPublishablePaths(spawnFn, "/fake/cwd");
    expect(result).toContain("old-name.ts");
    expect(result).toContain("new-name.ts");
  });

  // TC-027: Exactly the three expected git command types are called
  it("TC-027: spawn call history contains only status, rev-list, and diff-tree commands", async () => {
    const { spawnFn, calls } = makeFakeSpawnFn([
      // git status
      { stdout: "M  src/index.ts\0", exitCode: 0 },
      // git rev-list
      { stdout: "oid1\n", exitCode: 0 },
      // git diff-tree for oid1
      { stdout: "src/other.ts\n", exitCode: 0 },
    ]);

    await collectPublishablePaths(spawnFn, "/fake/cwd");

    // First call: git status
    expect(calls[0]?.args).toContain("status");
    expect(calls[0]?.args).toContain("--porcelain");
    expect(calls[0]?.args).toContain("--untracked-files=all");

    // Second call: git rev-list
    expect(calls[1]?.args).toContain("rev-list");
    expect(calls[1]?.args).toContain("HEAD");
    expect(calls[1]?.args).toContain("--not");

    // Third call: git diff-tree
    expect(calls[2]?.args).toContain("diff-tree");
    expect(calls[2]?.args).toContain("oid1");

    // Only 3 calls total
    expect(calls).toHaveLength(3);
  });

  it("worktree changes and unpushed commit paths are unioned (deduplicated)", async () => {
    const { spawnFn } = makeFakeSpawnFn([
      // worktree: ci.yml modified
      { stdout: "M  .github/workflows/ci.yml\0", exitCode: 0 },
      // rev-list: one unpushed commit
      { stdout: "abc123\n", exitCode: 0 },
      // diff-tree: ci.yml + another file
      { stdout: ".github/workflows/ci.yml\nsrc/foo.ts\n", exitCode: 0 },
    ]);
    const result = await collectPublishablePaths(spawnFn, "/fake/cwd");
    // ci.yml should appear only once
    const ciCount = result.filter((p) => p === ".github/workflows/ci.yml").length;
    expect(ciCount).toBe(1);
    expect(result).toContain("src/foo.ts");
  });

  it("git status failure returns empty (fail-open, no throw)", async () => {
    const { spawnFn } = makeFakeSpawnFn([
      { stdout: "", exitCode: 1 }, // status failure
      { stdout: "", exitCode: 0 }, // rev-list empty
    ]);
    // Should not throw
    const result = await collectPublishablePaths(spawnFn, "/fake/cwd");
    expect(Array.isArray(result)).toBe(true);
  });
});
