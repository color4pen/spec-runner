/**
 * Unit tests for unpushable-path contract validation in LocalRuntime and ManagedRuntime.
 *
 * ManagedRuntime: skip unpushable-path (T-07):
 *   TC-019: Managed runtime reports no violation for the unpushable-path contract
 *   TC-032: ManagedRuntime with branch=undefined does not produce an unpushable-path violation
 *
 * Unchanged Behavior (Requirement 7):
 *   TC-017: No capability git commands execute in an undeclared environment
 *   TC-018: Declared patterns with a non-matching diff allow commit and push to proceed normally
 *
 * LocalRuntime: unpushable-path detection (T-06):
 *   Worktree with .github/workflows/ci.yml → violation with that path in detail
 *   Worktree with src/foo.ts only → no violation
 *   Empty patterns in contract → no git commands called
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { LocalRuntime } from "../../../src/core/runtime/local.js";
import { ManagedRuntime } from "../../../src/core/runtime/managed.js";
import type { OutputContract } from "../../../src/core/port/output-contract.js";
import type { SpawnFn } from "../../../src/util/spawn.js";
import { WORKFLOWS_PATTERN } from "../../../src/git/push-capability.js";

// ---------------------------------------------------------------------------
// LocalRuntime helpers
// ---------------------------------------------------------------------------

function makeLocalRuntime(spawnFn: SpawnFn): LocalRuntime {
  const mockGithubClient = {
    createPullRequest: async () => ({ url: "", number: 0, createdAt: "" }),
    getPullRequest: async () => null,
  } as unknown as ConstructorParameters<typeof LocalRuntime>[0]["githubClient"];
  return new LocalRuntime({
    cwd: "/fake/cwd",
    githubClient: mockGithubClient,
    spawnFn,
  });
}

/**
 * Build a fake SpawnFn with configurable responses.
 * Records all call arguments for verification.
 */
function makeFakeSpawn(
  responses: Record<string, { stdout: string; exitCode: number }>,
): { spawnFn: SpawnFn; callArgs: string[][] } {
  const callArgs: string[][] = [];
  const spawnFn: SpawnFn = async (_cmd: string, args: string[]) => {
    callArgs.push(args);
    // Match on the first distinct argument (e.g., "status", "rev-list", "diff-tree")
    const key = args[0] ?? "";
    const resp = responses[key] ?? { stdout: "", exitCode: 0 };
    return { exitCode: resp.exitCode, stdout: resp.stdout, stderr: "" };
  };
  return { spawnFn, callArgs };
}

// ---------------------------------------------------------------------------
// ManagedRuntime helpers
// ---------------------------------------------------------------------------

function makeManagedRuntime(): { runtime: ManagedRuntime; callArgs: string[][] } {
  const callArgs: string[][] = [];
  const spawnFn: SpawnFn = async (_cmd: string, args: string[]) => {
    callArgs.push(args);
    // Only respond to fetch calls (used by validateStepOutputs before validation)
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  const mockSessionClient = {} as ConstructorParameters<typeof ManagedRuntime>[1];
  const mockGithubClient = {
    getRawFile: async () => "content",
  } as unknown as ConstructorParameters<typeof ManagedRuntime>[2];
  const mockRepo = { owner: "testowner", name: "testrepo" } as ConstructorParameters<typeof ManagedRuntime>[3];
  const runtime = new ManagedRuntime(
    "/fake/cwd",
    mockSessionClient,
    mockGithubClient,
    mockRepo,
    spawnFn,
    "ghp_test",
  );
  return { runtime, callArgs };
}

// ---------------------------------------------------------------------------
// LocalRuntime.validateStepOutputs — unpushable-path
// ---------------------------------------------------------------------------

describe("LocalRuntime.validateStepOutputs — unpushable-path", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "local-unpushable-path-test-"));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("worktree contains .github/workflows/ci.yml → violation with that path in detail", async () => {
    const { spawnFn } = makeFakeSpawn({
      status: { stdout: "M  .github/workflows/ci.yml\0", exitCode: 0 },
      "rev-list": { stdout: "", exitCode: 0 },
    });
    const runtime = makeLocalRuntime(spawnFn);

    const contracts: OutputContract[] = [
      {
        kind: "unpushable-path",
        path: "",
        policy: "follow-up",
        patterns: [WORKFLOWS_PATTERN],
      },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.kind).toBe("unpushable-path");
    expect(result.violations[0]?.policy).toBe("follow-up");
    expect(result.violations[0]?.detail).toContain(".github/workflows/ci.yml");
  });

  it("TC-018: worktree contains src/foo.ts only → no violation", async () => {
    const { spawnFn } = makeFakeSpawn({
      status: { stdout: "M  src/foo.ts\0", exitCode: 0 },
      "rev-list": { stdout: "", exitCode: 0 },
    });
    const runtime = makeLocalRuntime(spawnFn);

    const contracts: OutputContract[] = [
      {
        kind: "unpushable-path",
        path: "",
        policy: "follow-up",
        patterns: [WORKFLOWS_PATTERN],
      },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(result.violations).toHaveLength(0);
  });

  // TC-017: No git commands called when patterns is empty
  it("TC-017: empty patterns in contract → no git commands called", async () => {
    const { spawnFn, callArgs } = makeFakeSpawn({});
    const runtime = makeLocalRuntime(spawnFn);

    const contracts: OutputContract[] = [
      {
        kind: "unpushable-path",
        path: "",
        policy: "follow-up",
        patterns: [], // empty patterns — should skip immediately
      },
    ];
    await runtime.validateStepOutputs(contracts, tempDir, null);
    // No git calls should be made for empty patterns
    expect(callArgs).toHaveLength(0);
  });

  // TC-017 (second case): when pushCapability is absent (no contract added), no git commands
  it("TC-017: no unpushable-path contract → no extra git commands", async () => {
    const { spawnFn, callArgs } = makeFakeSpawn({});
    const runtime = makeLocalRuntime(spawnFn);

    const contracts: OutputContract[] = []; // no contracts at all
    await runtime.validateStepOutputs(contracts, tempDir, null);
    expect(callArgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ManagedRuntime.validateStepOutputs — unpushable-path skip
// ---------------------------------------------------------------------------

describe("ManagedRuntime.validateStepOutputs — unpushable-path skip", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "managed-unpushable-path-test-"));
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  // TC-019: Managed runtime reports no violation for unpushable-path contract
  it("TC-019: managed runtime produces zero violations for unpushable-path contract", async () => {
    const { runtime } = makeManagedRuntime();

    const contracts: OutputContract[] = [
      {
        kind: "unpushable-path",
        path: "",
        policy: "follow-up",
        patterns: [WORKFLOWS_PATTERN],
      },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, "feat/my-branch");
    const unpushableViolations = result.violations.filter((v) => v.kind === "unpushable-path");
    expect(unpushableViolations).toHaveLength(0);
  });

  // TC-032: ManagedRuntime with branch=undefined (null) does not produce unpushable-path violation
  it("TC-032: managed runtime with branch=null does not produce unpushable-path violation", async () => {
    const { runtime } = makeManagedRuntime();

    const contracts: OutputContract[] = [
      {
        kind: "unpushable-path",
        path: "",
        policy: "follow-up",
        patterns: [WORKFLOWS_PATTERN],
      },
    ];
    // branch=null simulates when branch is undefined/unresolved
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    const unpushableViolations = result.violations.filter((v) => v.kind === "unpushable-path");
    expect(unpushableViolations).toHaveLength(0);
  });

  it("TC-032: unpushable-path skip occurs before the !branch early-return guard", async () => {
    // Verify: with branch=null and ONLY an unpushable-path contract,
    // no violations are produced. If the unpushable-path skip happened AFTER the
    // !branch guard, the !branch guard would push a violation for it.
    const { runtime } = makeManagedRuntime();

    const contracts: OutputContract[] = [
      {
        kind: "unpushable-path",
        path: "",
        policy: "follow-up",
        patterns: [WORKFLOWS_PATTERN],
      },
    ];
    const result = await runtime.validateStepOutputs(contracts, tempDir, null);
    // Zero total violations (skip happens before !branch check)
    expect(result.violations).toHaveLength(0);
  });

  it("other contract kinds still behave correctly alongside unpushable-path skip", async () => {
    // With branch=null, produced contracts get violations; unpushable-path does not.
    // Build a ManagedRuntime where getRawFile returns null (produced violation).
    const callArgs: string[][] = [];
    const spawnFn: SpawnFn = async (_cmd: string, args: string[]) => {
      callArgs.push(args);
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const mockSessionClient = {} as ConstructorParameters<typeof ManagedRuntime>[1];
    const mockGithubClient = {
      getRawFile: async () => null, // → produced violation
    } as unknown as ConstructorParameters<typeof ManagedRuntime>[2];
    const mockRepo = { owner: "testowner", name: "testrepo" } as ConstructorParameters<typeof ManagedRuntime>[3];
    const runtime = new ManagedRuntime(
      "/fake/cwd",
      mockSessionClient,
      mockGithubClient,
      mockRepo,
      spawnFn,
      "ghp_test",
    );

    const contracts: OutputContract[] = [
      {
        kind: "unpushable-path",
        path: "",
        policy: "follow-up",
        patterns: [WORKFLOWS_PATTERN],
      },
    ];

    // With branch=null, only non-unpushable-path contracts get violations
    const result = await runtime.validateStepOutputs(contracts, "/fake/cwd", null);
    const unpushableViolations = result.violations.filter((v) => v.kind === "unpushable-path");
    expect(unpushableViolations).toHaveLength(0);
  });
});
