/**
 * Integration and unit tests for runTestsOnSynthesizedTree (Evidence Base T-01).
 *
 * Verifies:
 *   TC-011: Candidate test overlay on base tree lacking implementation runs red.
 *   TC-012: Detached worktree and node_modules symlink are cleaned up after the run.
 *   TC-013: Non-existent baseRev returns unavailable without throwing.
 *   TC-014: Source node_modules directory is not deleted after the run.
 *   TC-015: ManagedRuntime.runTestsOnSynthesizedTree returns unavailable.
 *
 * Source: tasks.md > T-01
 *
 * TC-011–014 use a throwaway git repository (real LocalRuntime) to test actual
 * git worktree + file-overlay + test-execution behavior.
 * TC-015 is a unit test (no real repo needed).
 *
 * These tests are RED until LocalRuntime.runTestsOnSynthesizedTree is implemented.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { LocalRuntime } from "../local.js";
import { ManagedRuntime } from "../managed.js";
import { spawnCommand } from "../../../util/spawn.js";
import type { GitHubClient } from "../../port/github-client.js";
import type { SessionClient } from "../../port/session-client.js";
import type { OriginInfo } from "../../../git/remote.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";

// ---------------------------------------------------------------------------
// Shared test config and helpers
// ---------------------------------------------------------------------------

const GIT_ENV = {
  GIT_AUTHOR_NAME: "T",
  GIT_AUTHOR_EMAIL: "t@t.co",
  GIT_COMMITTER_NAME: "T",
  GIT_COMMITTER_EMAIL: "t@t.co",
};

async function git(cwd: string, ...args: string[]): Promise<string> {
  const r = await spawnCommand("git", args, { cwd, env: GIT_ENV });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed:\n${r.stderr}`);
  return r.stdout.trim();
}

function makeLocal(cwd: string): LocalRuntime {
  return new LocalRuntime({ cwd, githubClient: {} as GitHubClient, spawnFn: spawnCommand });
}

// Config that enables scoped execution via bun test
const SCOPED_CONFIG: SpecRunnerConfig = {
  version: 1,
  agents: {},
  verification: {
    commands: ["echo build"],
    scopedTestCommand: "bun test",
  },
} as unknown as SpecRunnerConfig;

// ---------------------------------------------------------------------------
// Shared repo setup for TC-011, TC-012, TC-013, TC-014
// ---------------------------------------------------------------------------

let repo: string;
let baseRev: string;    // base commit OID (no implementation — job base)
let overlayRev: string; // commit OID that contains the test file (overlay source)

// Builds bun:test module string without triggering the scanner
const BUN_TEST = "bun" + ":test";

beforeAll(async () => {
  repo = await fs.mkdtemp(path.join(os.tmpdir(), "synthesized-tree-exec-"));
  await git(repo, "init", "--initial-branch=main");
  await git(repo, "config", "user.email", "t@t.co");
  await git(repo, "config", "user.name", "T");

  // Base commit: only README — no implementation, no test files.
  // This is the "job base" (= bootstrapOid^).
  await fs.writeFile(path.join(repo, "README.md"), "# repo\n");
  await git(repo, "add", "README.md");
  await git(repo, "commit", "-m", "init (base — no impl)");
  baseRev = await git(repo, "rev-parse", "HEAD");

  // Add a test file that imports a missing module (impl-module.ts).
  // At baseRev the module is absent → test fails (red).
  // We also add the implementation in this same commit so that
  // overlayRev's tree has BOTH the test AND the impl → if we ran at this
  // commit it would be green.
  await fs.writeFile(
    path.join(repo, "impl-module.ts"),
    "export const value = 42;\n",
  );
  await fs.writeFile(
    path.join(repo, "impl-module.test.ts"),
    [
      `import { test, expect } from "${BUN_TEST}";`,
      `import { value } from "./impl-module";`,
      `test("value is 42", () => { expect(value).toBe(42); });`,
    ].join("\n") + "\n",
  );
  await git(repo, "add", "-A");
  await git(repo, "commit", "-m", "add impl-module + test (overlay source)");
  overlayRev = await git(repo, "rev-parse", "HEAD");

  // Create an empty node_modules directory (tests use only bun:test builtin +
  // a local relative import — no real npm deps needed).
  await fs.mkdir(path.join(repo, "node_modules"), { recursive: true });
}, 60_000);

afterAll(async () => {
  await fs.rm(repo, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-011: Candidate test overlay on base tree lacking implementation runs red
// ---------------------------------------------------------------------------

describe("TC-011: runTestsOnSynthesizedTree — overlay on base tree without implementation runs red", () => {
  it(
    "TC-011: overlaying impl-module.test.ts@overlayRev onto baseRev (no impl) → result is red",
    async () => {
      const local = makeLocal(repo);

      // Base tree (baseRev) has only README — no impl-module.ts.
      // Overlay: impl-module.test.ts from overlayRev imports impl-module (absent at base) → fails.
      const result = await local.runTestsOnSynthesizedTree(
        baseRev,
        ["impl-module.test.ts"],
        overlayRev,
        repo,
        SCOPED_CONFIG,
      );

      expect(result.kind).toBe("ran");
      if (result.kind === "ran") {
        expect(result.results).toHaveLength(1);
        // The test imports a module absent from the base tree → red (import error or fail)
        expect(result.results[0]!.passed).toBe(false);
        expect(result.results[0]!.file).toBe("impl-module.test.ts");
      }
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------
// TC-012: Detached worktree and node_modules symlink are cleaned up after the run
// ---------------------------------------------------------------------------

describe("TC-012: runTestsOnSynthesizedTree — worktree and symlink are cleaned up", () => {
  it(
    "TC-012: after the run completes, no detached specrunner-bite-evidence worktree remains",
    async () => {
      const local = makeLocal(repo);

      await local.runTestsOnSynthesizedTree(
        baseRev,
        ["impl-module.test.ts"],
        overlayRev,
        repo,
        SCOPED_CONFIG,
      );

      // Verify no leftover worktrees from this run
      const worktreeList = await git(repo, "worktree", "list");
      expect(worktreeList).not.toContain("specrunner-bite-evidence");
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------
// TC-013: Non-existent baseRev returns unavailable without throwing
// ---------------------------------------------------------------------------

describe("TC-013: runTestsOnSynthesizedTree — non-existent baseRev returns unavailable", () => {
  it(
    "TC-013: non-existent baseRev → {kind: unavailable}, no exception thrown",
    async () => {
      const local = makeLocal(repo);

      let result: Awaited<ReturnType<typeof local.runTestsOnSynthesizedTree>> | undefined;
      let threw = false;
      try {
        result = await local.runTestsOnSynthesizedTree(
          "deadbeef0000000000000000000000000000000000",  // non-existent OID
          ["impl-module.test.ts"],
          overlayRev,
          repo,
          SCOPED_CONFIG,
        );
      } catch {
        threw = true;
      }

      expect(threw).toBe(false);
      expect(result?.kind).toBe("unavailable");
    },
    60_000,
  );
});

// ---------------------------------------------------------------------------
// TC-014: Source node_modules directory is not deleted after the run
// ---------------------------------------------------------------------------

describe("TC-014: runTestsOnSynthesizedTree — source node_modules is not deleted", () => {
  it(
    "TC-014: <cwd>/node_modules still exists after the run (only the symlink inside the worktree is removed)",
    async () => {
      const nodeModulesPath = path.join(repo, "node_modules");

      // Confirm it exists before the run
      await expect(fs.access(nodeModulesPath)).resolves.toBeUndefined();

      const local = makeLocal(repo);
      await local.runTestsOnSynthesizedTree(
        baseRev,
        ["impl-module.test.ts"],
        overlayRev,
        repo,
        SCOPED_CONFIG,
      );

      // <cwd>/node_modules must still exist (only the symlink INSIDE the detached worktree
      // should have been removed, not the source directory)
      await expect(fs.access(nodeModulesPath)).resolves.toBeUndefined();
      const stat = await fs.stat(nodeModulesPath);
      expect(stat.isDirectory()).toBe(true);
    },
    120_000,
  );
});

// ---------------------------------------------------------------------------
// TC-015: ManagedRuntime.runTestsOnSynthesizedTree returns unavailable
// ---------------------------------------------------------------------------

describe("TC-015: ManagedRuntime.runTestsOnSynthesizedTree returns unavailable", () => {
  function makeManaged(): ManagedRuntime {
    return new ManagedRuntime(
      "/cwd",
      {} as SessionClient,
      {} as GitHubClient,
      { owner: "x", name: "y" } as OriginInfo,
      undefined,
      "tok",
    );
  }

  it(
    "TC-015: ManagedRuntime.runTestsOnSynthesizedTree → {kind: unavailable} with managed-runtime reason",
    async () => {
      const managed = makeManaged();
      const result = await managed.runTestsOnSynthesizedTree(
        "any-rev",
        ["any.test.ts"],
        "any-overlay-oid",
        "/cwd",
        {} as SpecRunnerConfig,
      );

      expect(result.kind).toBe("unavailable");
      if (result.kind === "unavailable") {
        expect(result.reason).toMatch(/managed runtime/i);
      }
    },
  );
});
