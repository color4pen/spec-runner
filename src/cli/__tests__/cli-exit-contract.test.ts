/**
 * Exit contract snapshot tests (T-01).
 *
 * Compares the actual exit code, stdout, and stderr of bin/specrunner.ts
 * for 23 canonical cases against the base fixture generated before production
 * changes.  Any unintentional shift in exit codes or output messages fails here.
 *
 * To regenerate the base fixture after an intentional change:
 *   bun run src/cli/__tests__/dump-exit-contract.ts
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { EXIT_CONTRACT_CASES } from "./exit-contract-cases.js";
import type { SetupKind } from "./exit-contract-cases.js";
import { runCase } from "./exit-contract-harness.js";
import baseFixture from "./fixtures/cli-exit-contract.base.json";
// NOTE: SpecRunnerError is NOT imported statically here because vi.resetModules()
// clears the module cache between tests, causing instanceof to fail when specrunner.ts
// loads a fresh errors.js after reset. We use a dynamic import inside applySetup instead,
// so errors.js is cached before specrunner.ts loads it.

// ---------------------------------------------------------------------------
// Mock declarations (hoisted by vitest)
// ---------------------------------------------------------------------------

// archive.js — spread actual so non-mocked exports work; swap out runArchive
vi.mock("../archive.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../archive.js")>();
  return {
    ...actual,
    runArchive: vi.fn().mockResolvedValue(0),
  };
});

// archive-from-issue.js — stub to prevent side effects
vi.mock("../archive-from-issue.js", () => ({
  runArchiveFromIssue: vi.fn().mockResolvedValue(0),
}));

// detection.js — default: not a worktree
vi.mock("../../core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));

// command-context.js — default: repo root is cwd
vi.mock("../command-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../command-context.js")>();
  return {
    ...actual,
    buildCommandContext: vi.fn().mockResolvedValue({
      repoRoot: process.cwd(),
      invokerCwd: process.cwd(),
    }),
  };
});

// run.js — stub to prevent side effects (job start)
vi.mock("../run.js", () => ({
  runRunCore: vi.fn().mockResolvedValue(0),
  handlePostPipelineState: vi.fn(),
  handleJobStart: vi.fn().mockResolvedValue(0),
}));

// resume.js — stub to prevent side effects (job resume)
vi.mock("../resume.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../resume.js")>();
  return {
    ...actual,
    runResumeCore: vi.fn().mockResolvedValue(0),
  };
});

// resume-from-issue.js — stub to prevent side effects
vi.mock("../resume-from-issue.js", () => ({
  runResumeFromIssue: vi.fn().mockResolvedValue(0),
}));

// Stub modules that make network / fs calls
vi.mock("../init.js", () => ({ runInit: vi.fn().mockResolvedValue(0), handleInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0), handleLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../doctor.js", () => ({
  runDoctor: vi.fn().mockResolvedValue(0),
  handleDoctor: vi.fn().mockResolvedValue(0),
  handleDoctorRepair: vi.fn().mockResolvedValue(0),
  buildExecFile: vi.fn(),
}));

// ---------------------------------------------------------------------------
// After each: restore module cache so each case gets a fresh specrunner import
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Fixture completeness guard
// ---------------------------------------------------------------------------

const EXPECTED_IDS = EXIT_CONTRACT_CASES.map((c) => c.id);

describe("cli-exit-contract fixture completeness", () => {
  it("fixture key set matches expected case ID list exactly", () => {
    const fixtureKeys = Object.keys(baseFixture).sort();
    const expectedKeys = [...EXPECTED_IDS].sort();
    expect(fixtureKeys).toEqual(expectedKeys);
  });
});

// ---------------------------------------------------------------------------
// Helper: configure mocks for each setup kind
// ---------------------------------------------------------------------------

async function applySetup(setup: SetupKind): Promise<void> {
  if (setup.kind === "none") return;

  if (setup.kind === "archive-resolve") {
    const { runArchive } = await import("../archive.js");
    vi.mocked(runArchive).mockResolvedValue(setup.value);
    return;
  }

  if (setup.kind === "archive-reject-specrunner-error") {
    const { runArchive } = await import("../archive.js");
    // Dynamic import ensures errors.js is loaded before specrunner.ts, so instanceof works
    const { SpecRunnerError } = await import("../../errors.js");
    const err = new SpecRunnerError(setup.code, setup.hint, setup.message, setup.exitCode as 1 | 2);
    vi.mocked(runArchive).mockRejectedValue(err);
    return;
  }

  if (setup.kind === "archive-reject-plain") {
    const { runArchive } = await import("../archive.js");
    vi.mocked(runArchive).mockRejectedValue(new Error(setup.message));
    return;
  }

  if (setup.kind === "worktree") {
    const { detectWorktree } = await import("../../core/worktree/detection.js");
    vi.mocked(detectWorktree).mockResolvedValue({
      isWorktree: true,
      mainWorktreePath: setup.mainWorktreePath,
    });
    return;
  }

  if (setup.kind === "no-repo") {
    const { buildCommandContext } = await import("../command-context.js");
    vi.mocked(buildCommandContext).mockResolvedValue({
      repoRoot: null,
      invokerCwd: "/tmp/not-a-repo",
    });
    return;
  }
}

// ---------------------------------------------------------------------------
// Snapshot tests — one per case
// ---------------------------------------------------------------------------

describe("cli-exit-contract: exit code and output snapshot", () => {
  for (const caseDef of EXIT_CONTRACT_CASES) {
    it(caseDef.id, async () => {
      const expected = (baseFixture as Record<string, { exitCode: number | null; stdout: string[]; stderr: string[] }>)[caseDef.id];
      expect(expected).toBeDefined();

      const result = await runCase(caseDef.argv, async () => {
        await applySetup(caseDef.setup);
      });

      expect(result).toEqual(expected);
    });
  }
});
