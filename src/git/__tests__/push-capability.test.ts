/**
 * Unit tests for push-capability.ts — exclusion-aware publish prediction.
 *
 * Covers:
 *   TC-011 (must):   worktree 成分の除外 path がフィルタされる
 *   TC-012 (must):   unpushed-commit 成分の path はフィルタされない
 *   TC-013 (must):   mixed reset された agent self-commit は worktree 成分として除外対象になる
 *   TC-014 (should): collectPublishablePaths の省略引数での後方互換性
 *   TC-022 (should): renderPushCapabilityNotice — 除外 path が advance warning から除かれる
 *   TC-023 (should): renderPushCapabilityNotice の省略引数での後方互換性
 *   TC-028 (must):   DSM 制約 — push-capability.ts が staging-containment.ts をインポートしない
 */

import { describe, it, expect } from "vitest";
import type { SpawnFn } from "../../util/spawn.js";
import {
  collectPublishablePaths,
  renderPushCapabilityNotice,
  WORKFLOWS_PATTERN,
} from "../push-capability.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build an async SpawnFn mock that returns scripted responses for each call.
 * Each entry in `responses` is consumed in order; excess calls return exit 0.
 */
function makeAsyncSpawnFn(
  responses: Array<{ exitCode: number; stdout?: string; stderr?: string }>,
): { fn: SpawnFn; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  let idx = 0;
  const fn: SpawnFn = async (cmd, args, _opts) => {
    calls.push({ cmd, args });
    const response = responses[idx++] ?? { exitCode: 0, stdout: "", stderr: "" };
    return {
      exitCode: response.exitCode,
      stdout: response.stdout ?? "",
      stderr: response.stderr ?? "",
    };
  };
  return { fn, calls };
}

/** Build a porcelain -z status line for a single file. */
function statusLine(xy: string, filePath: string): string {
  return `${xy} ${filePath}\0`;
}

// Push capability fixture for .github/workflows/**
const WORKFLOWS_CAPABILITY = {
  patterns: [WORKFLOWS_PATTERN],
  source: "GitHub Actions installation token cannot push .github/workflows/**",
};

// ---------------------------------------------------------------------------
// TC-011: worktree 成分の除外 path がフィルタされる
// ---------------------------------------------------------------------------

describe("TC-011: worktree component exclusion filters matching paths", () => {
  it(
    "TC-011: .github/workflows/x.yml in worktree is excluded when worktreeExcludePatterns matches",
    async () => {
      // GIVEN: worktree has .github/workflows/x.yml dirty, and the pattern matches
      const statusOut = statusLine("??", ".github/workflows/x.yml");
      const { fn } = makeAsyncSpawnFn([
        { exitCode: 0, stdout: statusOut },  // git status (worktree component)
        { exitCode: 0, stdout: "" },          // git rev-list (no unpushed commits)
      ]);

      // WHEN: collectPublishablePaths is called with worktreeExcludePatterns
      const result = await collectPublishablePaths(fn, "/tmp/repo", [".github/workflows/**"]);

      // THEN: .github/workflows/x.yml is NOT in the result (excluded)
      expect(result).not.toContain(".github/workflows/x.yml");
    },
  );

  it(
    "TC-011b: non-excluded paths remain in the result even when exclusion is configured",
    async () => {
      const statusOut =
        statusLine("??", ".github/workflows/x.yml") +
        statusLine(" M", "src/index.ts");
      const { fn } = makeAsyncSpawnFn([
        { exitCode: 0, stdout: statusOut },
        { exitCode: 0, stdout: "" },
      ]);

      const result = await collectPublishablePaths(fn, "/tmp/repo", [".github/workflows/**"]);

      // .github/workflows/x.yml excluded; src/index.ts stays
      expect(result).not.toContain(".github/workflows/x.yml");
      expect(result).toContain("src/index.ts");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-012: unpushed-commit 成分の path はフィルタされない
// ---------------------------------------------------------------------------

describe("TC-012: unpushed-commit component is NOT filtered by worktreeExcludePatterns", () => {
  it(
    "TC-012: .github/workflows/x.yml in an unpushed commit remains in the result",
    async () => {
      // GIVEN: worktree is clean; the file was committed but not pushed
      const commitOid = "abc1234def56789";
      const { fn } = makeAsyncSpawnFn([
        { exitCode: 0, stdout: "" },                         // git status: clean worktree
        { exitCode: 0, stdout: `${commitOid}\n` },           // git rev-list: one unpushed commit
        { exitCode: 0, stdout: ".github/workflows/x.yml\n" }, // git diff-tree: the file
      ]);

      // WHEN: worktreeExcludePatterns matches the workflow pattern
      const result = await collectPublishablePaths(fn, "/tmp/repo", [".github/workflows/**"]);

      // THEN: .github/workflows/x.yml IS in the result (commit component is NOT filtered)
      expect(result).toContain(".github/workflows/x.yml");
    },
  );

  it(
    "TC-012b: same path in both worktree (dirty) and unpushed commit — commit component wins",
    async () => {
      // GIVEN: .github/workflows/x.yml is both worktree-dirty AND in an unpushed commit
      // This simulates a mixed-reset scenario where the agent committed and was then reset.
      const commitOid = "abc1234def56789";
      const statusOut = statusLine("??", ".github/workflows/x.yml");
      const { fn } = makeAsyncSpawnFn([
        { exitCode: 0, stdout: statusOut },                   // git status: worktree dirty
        { exitCode: 0, stdout: `${commitOid}\n` },           // git rev-list: one commit
        { exitCode: 0, stdout: ".github/workflows/x.yml\n" }, // git diff-tree
      ]);

      // WHEN: worktreeExcludePatterns excludes the workflow file
      const result = await collectPublishablePaths(fn, "/tmp/repo", [".github/workflows/**"]);

      // THEN: still present because the commit component includes it (worktree was excluded,
      // but commit adds it back)
      expect(result).toContain(".github/workflows/x.yml");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-013: mixed reset された agent self-commit は worktree 成分として除外対象になる
// ---------------------------------------------------------------------------

describe("TC-013: mixed-reset agent self-commit is treated as worktree component (excluded)", () => {
  it(
    "TC-013: after mixed reset, .github/workflows/x.yml appears as untracked → excluded",
    async () => {
      // GIVEN: after mixed reset, .github/workflows/x.yml appears as ?? in git status
      // AND worktreeExcludePatterns: [".github/workflows/**"]
      const statusOut = statusLine("??", ".github/workflows/x.yml");
      const { fn } = makeAsyncSpawnFn([
        { exitCode: 0, stdout: statusOut },  // git status: untracked (post-reset)
        { exitCode: 0, stdout: "" },          // git rev-list: no unpushed commits (reset undid it)
      ]);

      // WHEN: collectPublishablePaths is called
      const result = await collectPublishablePaths(fn, "/tmp/repo", [".github/workflows/**"]);

      // THEN: .github/workflows/x.yml is NOT in the result (worktree component → excluded)
      expect(result).not.toContain(".github/workflows/x.yml");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-014: collectPublishablePaths の省略引数での後方互換性
// ---------------------------------------------------------------------------

describe("TC-014: backward compatibility when worktreeExcludePatterns is omitted", () => {
  it(
    "TC-014: omitting worktreeExcludePatterns preserves all dirty paths (existing behavior)",
    async () => {
      const statusOut =
        statusLine("??", ".github/workflows/ci.yml") +
        statusLine(" M", "src/index.ts");
      const { fn } = makeAsyncSpawnFn([
        { exitCode: 0, stdout: statusOut },
        { exitCode: 0, stdout: "" },
      ]);

      // WHEN: no worktreeExcludePatterns argument
      const result = await collectPublishablePaths(fn, "/tmp/repo");

      // THEN: all dirty paths are included (no exclusion)
      expect(result).toContain(".github/workflows/ci.yml");
      expect(result).toContain("src/index.ts");
    },
  );
});

// ---------------------------------------------------------------------------
// TC-022: renderPushCapabilityNotice — 除外 path が advance warning から除かれる
// ---------------------------------------------------------------------------

describe("TC-022: renderPushCapabilityNotice — excluded paths removed from advance warning", () => {
  it(
    "TC-022: excluded path is not in advance warning; non-excluded path remains",
    () => {
      // GIVEN: worktreeExcludePatterns: [".github/workflows/**"]
      // AND predictedTouchedFiles includes both a matching and a non-matching file
      const notice = renderPushCapabilityNotice(
        WORKFLOWS_CAPABILITY,
        [".github/workflows/ci.yml", "src/index.ts"],
        [".github/workflows/**"],
      );

      // THEN: .github/workflows/ci.yml is excluded from the warning
      // (src/index.ts would not match the unpushable pattern anyway, so it's not in warning either)
      // The key invariant: the excluded file does NOT appear as a matched file in the notice
      expect(notice).not.toMatch(/ci\.yml/);
    },
  );

  it(
    "TC-022b: without exclusion, matching file appears in advance warning",
    () => {
      // Baseline: without exclusion, .github/workflows/ci.yml IS warned about
      const notice = renderPushCapabilityNotice(
        WORKFLOWS_CAPABILITY,
        [".github/workflows/ci.yml"],
        // no exclusion
      );
      expect(notice).toMatch(/ci\.yml/);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-023: renderPushCapabilityNotice の省略引数での後方互換性
// ---------------------------------------------------------------------------

describe("TC-023: renderPushCapabilityNotice backward compatibility (omitted 3rd arg)", () => {
  it(
    "TC-023: omitting worktreeExcludePatterns preserves existing behavior",
    () => {
      // GIVEN: worktreeExcludePatterns omitted
      const notice = renderPushCapabilityNotice(
        WORKFLOWS_CAPABILITY,
        [".github/workflows/ci.yml"],
        // no 3rd argument
      );

      // THEN: advance warning is shown as before (no exclusion filter)
      expect(notice).toContain("Advance warning");
      expect(notice).toMatch(/ci\.yml/);
    },
  );
});

// ---------------------------------------------------------------------------
// TC-028: DSM 制約 — push-capability.ts が staging-containment.ts をインポートしない
// ---------------------------------------------------------------------------

describe("TC-028: DSM constraint — push-capability.ts does not import staging-containment.ts", () => {
  it(
    "TC-028: push-capability.ts source does not contain a staging-containment import",
    async () => {
      // Static analysis of the source file: no import from staging-containment
      const { readFile } = await import("node:fs/promises");
      const { resolve, dirname } = await import("node:path");
      const { fileURLToPath } = await import("node:url");

      const dir = dirname(fileURLToPath(import.meta.url));
      const sourceFile = resolve(dir, "../push-capability.ts");
      const source = await readFile(sourceFile, "utf-8");

      // No import from staging-containment in any form
      expect(source).not.toMatch(/staging-containment/);
    },
  );

  it(
    "TC-028b: matchesGlob is used inline (imported from util/glob-match, not staging-containment)",
    async () => {
      const { readFile } = await import("node:fs/promises");
      const { resolve, dirname } = await import("node:path");
      const { fileURLToPath } = await import("node:url");

      const dir = dirname(fileURLToPath(import.meta.url));
      const sourceFile = resolve(dir, "../push-capability.ts");
      const source = await readFile(sourceFile, "utf-8");

      // matchesGlob is imported from glob-match (shared util), not staging-containment
      expect(source).toMatch(/glob-match/);
      expect(source).toMatch(/matchesGlob/);
    },
  );
});
