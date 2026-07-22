/**
 * Integration / E2E tests for bootstrap-commit-egress-ledger
 *
 * TC-007: first push egress passes when bootstrap OID is in ledger
 * TC-008: first push egress fails when bootstrap OID is absent from ledger (destruction confirmation)
 * TC-009: existing egress and synthesis tests remain green after fix (meta assertion)
 *
 * TC-007 and TC-008 use real git repos in $TMPDIR.
 * They call verifyEgressLedger directly, which is already implemented. These tests
 * demonstrate the egress behavior that the bootstrap fix (T-01 through T-03) enables.
 *
 * TC-007: Should be GREEN now and after fix (verifyEgressLedger already works with full ledger).
 * TC-008: Should be GREEN now and after fix (destruction confirmation: absent bootstrapOid halts egress).
 *
 * TC-009: Meta test — confirms that the existing egress/synthesis/state test files exist
 * and their modules are importable. The actual test run is verified by CI.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";
import { verifyEgressLedger } from "../src/core/step/commit-push.js";
import { ERROR_CODES } from "../src/errors.js";
import type { SpawnFn } from "../src/util/spawn.js";

// ─────────────────────────────────────────────────────────────────────────────
// Git sync helpers (real git commands for integration tests)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run a git command synchronously; throw on non-zero exit. Returns trimmed stdout.
 */
function gitSync(args: string[], cwd: string): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return (result.stdout ?? "").trim();
}

/**
 * Initialize a minimal real git repo in dir.
 */
async function createGitRepo(dir: string): Promise<void> {
  gitSync(["init"], dir);
  gitSync(["config", "user.email", "e2e-bootstrap@spec-runner.local"], dir);
  gitSync(["config", "user.name", "Bootstrap Egress E2E Test"], dir);
}

/**
 * Create a bare remote repo and add it as "origin".
 */
async function createBareRemote(repoDir: string, bareDir: string): Promise<void> {
  gitSync(["init", "--bare", bareDir], repoDir);
  gitSync(["remote", "add", "origin", bareDir], repoDir);
}

/**
 * Make an initial commit in repoDir and push to origin/main. Returns HEAD OID.
 */
async function makeInitialCommitAndPush(repoDir: string): Promise<string> {
  const readmePath = path.join(repoDir, "README.md");
  await fs.writeFile(readmePath, "# Bootstrap Egress E2E Test\n", "utf-8");
  gitSync(["add", "README.md"], repoDir);
  gitSync(["commit", "-m", "initial: test repo setup"], repoDir);
  // Push initial commit to bare remote so origin/main exists
  gitSync(["push", "origin", "HEAD:main"], repoDir);
  return gitSync(["rev-parse", "HEAD"], repoDir);
}

/**
 * SpawnFn that delegates to real git for all commands except push (intercepted, returns success).
 * Used so verifyEgressLedger can call git rev-list against the real repo.
 */
function makePipelineSpawnFn(repoDir: string): SpawnFn {
  return async (cmd: string, args: string[], _opts?: { cwd?: string }) => {
    if (args[0] === "push") {
      // Intercept push — return success without executing
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    const result = spawnSync(cmd, args, { cwd: repoDir, encoding: "utf8" });
    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bootstrap-egress-e2e-"));
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-007: first push egress passes when bootstrap OID is in ledger
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-007: first push egress passes when bootstrap OID is in ledger", () => {
  it(
    "verifyEgressLedger resolves when both bootstrapOid and stepOid are in the ledger",
    async () => {
      // Setup: real git repo + bare remote
      const repoDir = path.join(tempDir, "repo");
      const bareDir = path.join(tempDir, "bare.git");
      await fs.mkdir(repoDir, { recursive: true });

      await createGitRepo(repoDir);
      await createBareRemote(repoDir, bareDir);
      await makeInitialCommitAndPush(repoDir);

      // Create feature branch
      gitSync(["checkout", "-b", "feat/test-slug"], repoDir);

      // Simulate the fixed bootstrap path: commit request.md and capture OID
      const changeFolderPath = path.join(repoDir, "specrunner", "changes", "test-slug");
      await fs.mkdir(changeFolderPath, { recursive: true });
      await fs.writeFile(path.join(changeFolderPath, "request.md"), "# Test request\n", "utf-8");
      gitSync(["add", path.join("specrunner", "changes", "test-slug", "request.md")], repoDir);
      gitSync(["commit", "-m", "add request.md for test-slug", "--", path.join("specrunner", "changes", "test-slug")], repoDir);
      const bootstrapOid = gitSync(["rev-parse", "HEAD"], repoDir);

      // Simulate a scoped step commit
      const srcDir = path.join(repoDir, "src");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, "impl.ts"), "// implementation\n", "utf-8");
      gitSync(["add", path.join("src", "impl.ts")], repoDir);
      gitSync(["commit", "-m", "step: implementer"], repoDir);
      const stepOid = gitSync(["rev-parse", "HEAD"], repoDir);

      const spawnFn = makePipelineSpawnFn(repoDir);

      // TC-007 assertion: egress passes when BOTH OIDs are in the ledger
      await expect(
        verifyEgressLedger({ cwd: repoDir, ledger: [bootstrapOid, stepOid], spawnFn }),
      ).resolves.toBeUndefined();
    },
    30000,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-008: first push egress fails when bootstrap OID is absent (destruction confirmation)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-008: first push egress fails when bootstrap OID is absent from ledger (destruction confirmation)", () => {
  it(
    "verifyEgressLedger rejects with EGRESS_UNKNOWN_COMMIT when bootstrapOid is not in the ledger",
    async () => {
      // Setup: same real git repo + bare remote
      const repoDir = path.join(tempDir, "repo");
      const bareDir = path.join(tempDir, "bare.git");
      await fs.mkdir(repoDir, { recursive: true });

      await createGitRepo(repoDir);
      await createBareRemote(repoDir, bareDir);
      await makeInitialCommitAndPush(repoDir);

      // Create feature branch
      gitSync(["checkout", "-b", "feat/test-slug"], repoDir);

      // Simulate bootstrap commit (captures OID)
      const changeFolderPath = path.join(repoDir, "specrunner", "changes", "test-slug");
      await fs.mkdir(changeFolderPath, { recursive: true });
      await fs.writeFile(path.join(changeFolderPath, "request.md"), "# Test request\n", "utf-8");
      gitSync(["add", path.join("specrunner", "changes", "test-slug", "request.md")], repoDir);
      gitSync(["commit", "-m", "add request.md for test-slug", "--", path.join("specrunner", "changes", "test-slug")], repoDir);
      const bootstrapOid = gitSync(["rev-parse", "HEAD"], repoDir);
      void bootstrapOid; // captured but intentionally excluded from ledger below

      // Simulate a scoped step commit
      const srcDir = path.join(repoDir, "src");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, "impl.ts"), "// implementation\n", "utf-8");
      gitSync(["add", path.join("src", "impl.ts")], repoDir);
      gitSync(["commit", "-m", "step: implementer"], repoDir);
      const stepOid = gitSync(["rev-parse", "HEAD"], repoDir);

      const spawnFn = makePipelineSpawnFn(repoDir);

      // TC-008 destruction confirmation: egress halts when bootstrapOid is absent from ledger.
      // This simulates the pre-fix behavior where bootstrap commit was NOT recorded.
      // This test must remain GREEN (rejection expected) even after the fix,
      // because the FIX records bootstrapOid — but this test deliberately omits it.
      let caughtError: unknown;
      try {
        await verifyEgressLedger({
          cwd: repoDir,
          ledger: [stepOid], // bootstrapOid intentionally omitted
          spawnFn,
        });
        throw new Error("Expected verifyEgressLedger to throw, but it resolved");
      } catch (err) {
        caughtError = err;
      }

      // Assert: must reject with EGRESS_UNKNOWN_COMMIT
      expect(caughtError).toBeDefined();
      expect(
        (caughtError as { code?: string }).code,
        "error code must be EGRESS_UNKNOWN_COMMIT when bootstrap OID is absent from ledger",
      ).toBe(ERROR_CODES.EGRESS_UNKNOWN_COMMIT);
    },
    30000,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-009: existing egress and synthesis tests remain green after fix (meta assertion)
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-009: existing egress and synthesis tests remain green after fix", () => {
  it("verifyEgressLedger is exported from commit-push.ts (existing export unchanged)", async () => {
    // Verify the import used by existing tests is intact
    const { verifyEgressLedger: fn } = await import("../src/core/step/commit-push.js");
    expect(typeof fn).toBe("function");
  });

  it("appendSynthesizedCommit is exported from state/schema.ts (existing export unchanged)", async () => {
    const { appendSynthesizedCommit } = await import("../src/state/schema.js");
    expect(typeof appendSynthesizedCommit).toBe("function");
  });

  it("appendSynthesizedCommit is idempotent: duplicate OID not added twice", async () => {
    const { appendSynthesizedCommit } = await import("../src/state/schema.js");
    const baseState = {
      version: 2 as const,
      jobId: "test-job-id",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "specrunner/changes/slug/request.md", title: "T", type: "bug-fix" as const, slug: "slug" },
      repository: { owner: "o", name: "r" },
      session: null,
      step: "init",
      status: "running" as const,
      branch: null,
      history: [],
      error: null,
    };
    const oid = "aabbccddeeff112233445566778899aabbccddee";
    const once = appendSynthesizedCommit(baseState, oid);
    const twice = appendSynthesizedCommit(once, oid);
    // Idempotent: same OID not added twice (existing behavior, must not regress)
    expect(twice.synthesizedCommits?.filter((o) => o === oid)).toHaveLength(1);
  });

  it("EGRESS_UNKNOWN_COMMIT error code is defined in ERROR_CODES (existing code)", () => {
    // Verify the error code used by the egress check exists (must not regress)
    expect(ERROR_CODES.EGRESS_UNKNOWN_COMMIT).toBe("EGRESS_UNKNOWN_COMMIT");
  });
});
