/**
 * Integration tests for design-layer mark-hook wiring in archive orchestrator.
 *
 * TC-ORCH-DL-001: designLayer disabled → mark-hook not spawned, archive succeeds
 * TC-ORCH-DL-002: designLayer enabled + mark exit 0 → archive succeeds
 * TC-ORCH-DL-003: designLayer enabled + mark exit 1 → warning, archive continues (exit 0)
 * TC-ORCH-DL-004: designLayer enabled + mark exit 2 → archive fails (exit 1)
 * TC-ORCH-DL-005: --pr arg included when pullRequest.number is present in state
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { FinishFs } from "../../../../src/core/finish/types.js";
import type { ResolvedDesignLayer } from "../../../../src/config/schema.js";

// ---------------------------------------------------------------------------
// Module mocks (identical to orchestrator.test.ts pattern)
// ---------------------------------------------------------------------------

vi.mock("../../../../src/store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn(),
  },
}));

vi.mock("../../../../src/core/finish/job-state-update.js", () => ({
  assertJobFinishable: vi.fn(),
  markJobArchived: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../../src/core/finish/derive-usage.js", () => ({
  deriveAndWriteUsage: vi.fn().mockResolvedValue({ ok: true, skipped: true, message: "skipped" }),
}));

vi.mock("../../../../src/core/finish/archive-change-folder.js", () => ({
  archiveChangeFolder: vi.fn().mockResolvedValue({ ok: true, skipped: false, message: "archived" }),
}));

vi.mock("../../../../src/core/finish/commit-archive.js", () => ({
  commitArchive: vi.fn().mockResolvedValue({ ok: true, skipped: false, message: "committed" }),
}));

vi.mock("../../../../src/core/worktree/manager.js", () => ({
  createWorktreeManager: vi.fn(),
  buildWorktreePath: vi.fn().mockReturnValue("/convention/worktree/path"),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFs(): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
    rm: vi.fn().mockResolvedValue(undefined),
  };
}

function makeJobState(opts: { prNumber?: number } = {}) {
  return {
    jobId: "test-job-id",
    status: "awaiting-archive",
    worktreePath: "/worktree",
    branch: "change/my-slug-abc12345",
    noWorktree: false,
    pullRequest: opts.prNumber !== undefined ? { number: opts.prNumber, url: "https://github.com/x/y/pull/" + opts.prNumber } : undefined,
    request: { path: "/repo/specrunner/changes/my-slug/request.md", title: "Test", type: "spec-change", slug: "my-slug" },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "pr-create",
    history: [],
    error: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const CWD = "/tmp/repo";
const SLUG = "my-slug";

/**
 * Build a SpawnFn that returns the configured aozu exit code when 'mark' is the first arg,
 * and 0 for all other commands (git, rev-parse, etc.).
 */
function makeSpawnWithAozuExit(aozuExitCode: number | null): SpawnFn {
  return vi.fn().mockImplementation(async (cmd: string, args: string[]) => {
    if (cmd !== "git" && args[0] === "mark") {
      return { exitCode: aozuExitCode, stdout: "", stderr: aozuExitCode !== 0 ? "aozu error" : "" };
    }
    // git add -A: return 0
    if (cmd === "git" && args[0] === "add") {
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    // git push, rev-parse, etc.
    return { exitCode: 0, stdout: "abc1234\n", stderr: "" };
  }) as unknown as SpawnFn;
}

const disabledDesignLayer: ResolvedDesignLayer = { enabled: false, command: "aozu", requireCitationTypes: [] };
const enabledDesignLayer: ResolvedDesignLayer = { enabled: true, command: "fake-aozu", requireCitationTypes: [] };

beforeEach(() => {
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// TC-ORCH-DL-001: disabled → no mark spawn
// ---------------------------------------------------------------------------

describe("TC-ORCH-DL-001: designLayer disabled → mark-hook not spawned", () => {
  it("archive succeeds without spawning aozu", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState({ prNumber: 42 })]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const spawn = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "abc\n", stderr: "" }) as SpawnFn;
    const result = await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn,
      fs: makeFs(),
      designLayer: disabledDesignLayer,
    });

    expect(result.exitCode).toBe(0);
    // No call to fake-aozu
    const markCalls = (spawn as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => c[0] === "fake-aozu",
    );
    expect(markCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-ORCH-DL-002: enabled + mark exit 0 → archive succeeds
// ---------------------------------------------------------------------------

describe("TC-ORCH-DL-002: enabled + mark exit 0 → archive succeeds", () => {
  it("returns exitCode 0", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState({ prNumber: 42 })]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const spawn = makeSpawnWithAozuExit(0);
    const result = await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn,
      fs: makeFs(),
      designLayer: enabledDesignLayer,
    });

    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-ORCH-DL-003: enabled + mark exit 1 → warning, archive continues
// ---------------------------------------------------------------------------

describe("TC-ORCH-DL-003: enabled + mark exit 1 → archive continues", () => {
  it("returns exitCode 0 (warning, not failure)", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState()]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const spawn = makeSpawnWithAozuExit(1);
    const result = await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn,
      fs: makeFs(),
      designLayer: enabledDesignLayer,
    });

    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-ORCH-DL-004: enabled + mark exit 2 → archive fails
// ---------------------------------------------------------------------------

describe("TC-ORCH-DL-004: enabled + mark exit 2 → archive fails", () => {
  it("returns exitCode 1 with escalation", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState()]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const spawn = makeSpawnWithAozuExit(2);
    const result = await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn,
      fs: makeFs(),
      designLayer: enabledDesignLayer,
    });

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 1) {
      expect(result.escalation).toContain("mark");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-ORCH-DL-005: --pr included when pullRequest.number present
// ---------------------------------------------------------------------------

describe("TC-ORCH-DL-005: --pr arg included when prNumber present", () => {
  it("includes --pr <n> in aozu spawn args", async () => {
    const { JobStateStore } = await import("../../../../src/store/job-state-store.js");
    (JobStateStore.list as ReturnType<typeof vi.fn>).mockResolvedValue([makeJobState({ prNumber: 77 })]);

    const { runArchiveOrchestrator } = await import("../../../../src/core/archive/orchestrator.js");

    const spawn = makeSpawnWithAozuExit(0);
    await runArchiveOrchestrator({
      slug: SLUG,
      cwd: CWD,
      spawn,
      fs: makeFs(),
      designLayer: enabledDesignLayer,
    });

    const markCall = (spawn as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: unknown[]) => c[0] === "fake-aozu",
    );
    expect(markCall).toBeDefined();
    if (markCall) {
      const args = markCall[1] as string[];
      expect(args).toContain("--pr");
      expect(args).toContain("77");
    }
  });
});
