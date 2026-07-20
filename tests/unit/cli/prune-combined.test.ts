/**
 * Unit tests for the combined runPrune CLI that invokes both runners.
 *
 * TC-005: Worktree and sidecar sections are distinguished in output
 * TC-013: Worktree prune behavior is unaffected
 * TC-022: runPrune exit code is the logical OR of the two runner exit codes
 *
 * [prune-force-recheck-before-delete change]
 * TC-009: Production CLI (runPrune) wires the real isOrphanSidecar as the re-check
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockPruneOrphanWorktrees = vi.fn();
const mockPruneOrphanSidecars = vi.fn();
const mockResolveRepoRootOrFail = vi.fn().mockResolvedValue("/repo");

vi.mock("../../../src/core/prune/runner.js", () => ({
  pruneOrphanWorktrees: mockPruneOrphanWorktrees,
}));

vi.mock("../../../src/core/prune/sidecar-runner.js", () => ({
  pruneOrphanSidecars: mockPruneOrphanSidecars,
}));

vi.mock("../../../src/util/repo-root.js", () => ({
  resolveRepoRootOrFail: mockResolveRepoRootOrFail,
}));

vi.mock("../../../src/core/worktree/manager.js", () => ({
  createWorktreeManager: vi.fn().mockReturnValue({
    create: vi.fn(),
    remove: vi.fn(),
    prune: vi.fn(),
  }),
}));

vi.mock("../../../src/util/spawn.js", () => ({
  spawnCommand: vi.fn(),
}));

import { runPrune } from "../../../src/cli/prune.js";
// isOrphanSidecar is intentionally NOT mocked — TC-009 checks the CLI wires the real predicate.
import { isOrphanSidecar } from "../../../src/core/sidecar/orphan.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorktreeResult(exitCode: 0 | 1 = 0, overrides = {}) {
  return { exitCode, message: "No orphan worktrees found", ...overrides };
}

function makeSidecarResult(exitCode: 0 | 1 = 0, overrides = {}) {
  return { exitCode, message: "No orphan sidecar directories found", ...overrides };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let stdoutLines: string[];
let stderrLines: string[];

beforeEach(() => {
  vi.clearAllMocks();
  stdoutLines = [];
  stderrLines = [];

  vi.spyOn(process.stdout, "write").mockImplementation((data) => {
    stdoutLines.push(String(data));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((data) => {
    stderrLines.push(String(data));
    return true;
  });

  // Default: both runners succeed with no orphans
  mockPruneOrphanWorktrees.mockResolvedValue(makeWorktreeResult());
  mockPruneOrphanSidecars.mockResolvedValue(makeSidecarResult());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// TC-022: runPrune exit code is the logical OR of the two runner exit codes
// ---------------------------------------------------------------------------

describe("TC-022: runPrune exit code is the logical OR of both runner exit codes", () => {
  it("returns 0 when both runners return exitCode 0", async () => {
    mockPruneOrphanWorktrees.mockResolvedValue(makeWorktreeResult(0));
    mockPruneOrphanSidecars.mockResolvedValue(makeSidecarResult(0));

    const code = await runPrune({ force: false });

    expect(code).toBe(0);
  });

  it("returns 1 when worktree runner returns 1 and sidecar runner returns 0", async () => {
    mockPruneOrphanWorktrees.mockResolvedValue(makeWorktreeResult(1));
    mockPruneOrphanSidecars.mockResolvedValue(makeSidecarResult(0));

    const code = await runPrune({ force: false });

    expect(code).toBe(1);
  });

  it("returns 1 when sidecar runner returns 1 and worktree runner returns 0", async () => {
    mockPruneOrphanWorktrees.mockResolvedValue(makeWorktreeResult(0));
    mockPruneOrphanSidecars.mockResolvedValue(makeSidecarResult(1));

    const code = await runPrune({ force: false });

    expect(code).toBe(1);
  });

  it("returns 1 when both runners return 1", async () => {
    mockPruneOrphanWorktrees.mockResolvedValue(makeWorktreeResult(1));
    mockPruneOrphanSidecars.mockResolvedValue(makeSidecarResult(1));

    const code = await runPrune({ force: false });

    expect(code).toBe(1);
  });

  it("invokes both runners regardless of which one fails", async () => {
    mockPruneOrphanWorktrees.mockResolvedValue(makeWorktreeResult(1));
    mockPruneOrphanSidecars.mockResolvedValue(makeSidecarResult(0));

    await runPrune({ force: true });

    expect(mockPruneOrphanWorktrees).toHaveBeenCalledOnce();
    expect(mockPruneOrphanSidecars).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// TC-005: Worktree and sidecar sections are distinguished in output
// ---------------------------------------------------------------------------

describe("TC-005: output presents orphan worktrees and sidecars under separate labeled sections", () => {
  it("output contains a worktree section label", async () => {
    mockPruneOrphanWorktrees.mockResolvedValue(makeWorktreeResult(0, {
      message: "Dry-run: 1 orphan worktree(s) would be removed. Use --force to delete.",
      info: ["Would remove: /repo/.git/specrunner-worktrees/my-feature-aabbccdd"],
    }));
    mockPruneOrphanSidecars.mockResolvedValue(makeSidecarResult(0, {
      message: "Dry-run: 1 orphan sidecar(s) would be removed. Use --force to delete.",
      info: ["Would remove: /repo/.specrunner/local/orphan-job"],
    }));

    await runPrune({ force: false });

    const allOutput = [...stdoutLines, ...stderrLines].join("");
    expect(allOutput).toMatch(/orphan worktree/i);
    expect(allOutput).toMatch(/orphan sidecar/i);
  });

  it("output contains a sidecar section label", async () => {
    await runPrune({ force: false });

    const allOutput = [...stdoutLines, ...stderrLines].join("");
    // Both sections should be labeled
    expect(allOutput.toLowerCase()).toContain("sidecar");
  });

  it("worktree and sidecar sections appear in the output as separate areas", async () => {
    mockPruneOrphanWorktrees.mockResolvedValue(makeWorktreeResult(0, {
      info: ["Would remove: /repo/.git/specrunner-worktrees/wt-aabbccdd"],
    }));
    mockPruneOrphanSidecars.mockResolvedValue(makeSidecarResult(0, {
      info: ["Would remove: /repo/.specrunner/local/sc-slug"],
    }));

    await runPrune({ force: false });

    const allOutput = [...stdoutLines, ...stderrLines].join("");
    // Both paths should appear in output
    expect(allOutput).toContain("wt-aabbccdd");
    expect(allOutput).toContain("sc-slug");
  });
});

// ---------------------------------------------------------------------------
// TC-013: Worktree prune behavior is unaffected
// ---------------------------------------------------------------------------

describe("TC-013: worktree prune behavior is unaffected", () => {
  it("passes force flag to pruneOrphanWorktrees", async () => {
    await runPrune({ force: true });

    expect(mockPruneOrphanWorktrees).toHaveBeenCalledOnce();
    const callArg = (mockPruneOrphanWorktrees as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArg.force).toBe(true);
  });

  it("passes force: false to pruneOrphanWorktrees in dry-run mode", async () => {
    await runPrune({ force: false });

    const callArg = (mockPruneOrphanWorktrees as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArg.force).toBe(false);
  });

  it("pruneOrphanWorktrees is always called (not skipped when sidecar runner is also present)", async () => {
    await runPrune({ force: false });

    expect(mockPruneOrphanWorktrees).toHaveBeenCalledOnce();
    expect(mockPruneOrphanSidecars).toHaveBeenCalledOnce();
  });

  it("pruneOrphanWorktrees receives repoRoot from resolveRepoRootOrFail", async () => {
    mockResolveRepoRootOrFail.mockResolvedValue("/custom/repo");

    await runPrune({ force: false });

    const callArg = (mockPruneOrphanWorktrees as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArg.deps.repoRoot).toBe("/custom/repo");
  });

  it("sidecar runner also receives the same repoRoot", async () => {
    mockResolveRepoRootOrFail.mockResolvedValue("/custom/repo");

    await runPrune({ force: false });

    const callArg = (mockPruneOrphanSidecars as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArg.deps.repoRoot).toBe("/custom/repo");
  });
});

// =============================================================================
// [prune-force-recheck-before-delete change]
// =============================================================================

// ---------------------------------------------------------------------------
// TC-009: Production CLI (runPrune) wires the real isOrphanSidecar as the re-check
// ---------------------------------------------------------------------------

describe("TC-009 [recheck]: runPrune wires the real isOrphanSidecar as the re-check dependency", () => {
  it("deps.recheck === isOrphanSidecar in the pruneOrphanSidecars call under force: true", async () => {
    // GIVEN runPrune is called with force: true
    await runPrune({ force: true });

    // WHEN the captured pruneOrphanSidecars call arg is inspected
    const callArg = (mockPruneOrphanSidecars as ReturnType<typeof vi.fn>).mock.calls[0]![0];

    // THEN deps.recheck === isOrphanSidecar (the imported real predicate)
    // isOrphanSidecar is not mocked, so this checks by reference equality that
    // the CLI wires the real function — not undefined, not a stub.
    expect(callArg.deps.recheck).toBe(isOrphanSidecar);
  });

  it("deps.recheck === isOrphanSidecar even in dry-run mode (force: false)", async () => {
    // The re-check wiring should be present regardless of force flag —
    // the runner itself chooses not to invoke it in dry-run mode (TC-005 / TC-011).
    await runPrune({ force: false });

    const callArg = (mockPruneOrphanSidecars as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(callArg.deps.recheck).toBe(isOrphanSidecar);
  });

  it("worktree runner call and combined exit code are unchanged by the recheck wiring", async () => {
    mockPruneOrphanWorktrees.mockResolvedValue(makeWorktreeResult(0));
    mockPruneOrphanSidecars.mockResolvedValue(makeSidecarResult(0));

    const code = await runPrune({ force: true });

    // Both runners still called exactly once
    expect(mockPruneOrphanWorktrees).toHaveBeenCalledOnce();
    expect(mockPruneOrphanSidecars).toHaveBeenCalledOnce();
    // Combined exit code is still logical OR of both runners
    expect(code).toBe(0);
  });
});
