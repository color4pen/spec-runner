/**
 * Unit tests for the `doctor repair <slug>` subcommand handler in command-registry.ts.
 *
 * TC-DR-001: `doctor repair` without slug → stderr error + process.exit(2)
 *   (spec.md > doctor repair subcommand > Scenario: missing slug argument)
 * TC-DR-002: `doctor repair <slug>` success → result message + process.exit(0)
 *   (spec.md > doctor repair subcommand > Scenario: successful repair)
 * TC-DR-003: `doctor repair <slug>` when repairSlugOccupancySidecar throws → error + process.exit(1)
 *   (spec.md > doctor repair subcommand > Scenario: repair throws)
 *
 * Source: spec.md, tasks.md > T-08
 *
 * NOTE: Tests call the handler directly (not via bin/specrunner.js) so that the
 * process.exit() thrown by the mock propagates cleanly to the test's try/catch,
 * bypassing the dispatch-level catch block that would re-map any non-zero exit
 * back to exit(1).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ParsedArgs } from "../../../src/cli/flag-parser.js";
import type { CommandDef } from "../../../src/cli/command-registry.js";

// ---------------------------------------------------------------------------
// Hoist the repair mock so we can control it per-test
// ---------------------------------------------------------------------------

const mockRepairFn = vi.hoisted(() => vi.fn());

// Mock heavy dependencies to allow command-registry.ts to load without side effects
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
  detectSpecrunnerWorktree: vi.fn().mockResolvedValue({ isSpecrunnerWorktree: false }),
}));
vi.mock("../../../src/cli/run.js", () => ({
  runRun: vi.fn().mockResolvedValue(undefined),
  handlePostPipelineState: vi.fn(),
}));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResume: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/archive.js", () => ({ runArchive: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/managed.js", () => ({
  runManagedSetup: vi.fn().mockResolvedValue(0),
  runManagedStatus: vi.fn().mockResolvedValue(0),
  runManagedReset: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/request.js", () => ({
  executeTemplate: vi.fn().mockReturnValue(0),
  executeValidate: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/request-create.js", () => ({
  executeCreate: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/request-list.js", () => ({
  executeList: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/request-new.js", () => ({
  executeNew: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/usage-show.js", () => ({
  showUsage: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/usage-summary.js", () => ({
  showUsageSummary: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/rules-new.js", () => ({
  executeRulesNew: vi.fn().mockResolvedValue(0),
}));
vi.mock("../../../src/core/command/reviewers-new.js", () => ({
  executeReviewersNew: vi.fn().mockResolvedValue(0),
}));
// Mock the dynamic import used by the doctor repair handler
vi.mock("../../../src/core/occupancy/repair.js", () => ({
  repairSlugOccupancySidecar: mockRepairFn,
}));

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

let stderrSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
  // Default: repair succeeds
  mockRepairFn.mockResolvedValue({ message: "sidecar repaired successfully" });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

/**
 * Call the doctor handler directly with given positionals.
 * Returns the process.exit code that was thrown (as a string like "process.exit(2)"),
 * or undefined if the handler returned normally.
 */
async function callDoctorHandler(positionals: string[]): Promise<string | undefined> {
  const { COMMANDS } = await import("../../../src/cli/command-registry.js");
  const doctorEntry = COMMANDS["doctor"]! as CommandDef;
  const parsed: ParsedArgs = {
    flags: {},
    positionals,
    positional: positionals[0],
  };
  try {
    await doctorEntry.handler(parsed, undefined);
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

function getStderrOutput(): string {
  return stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

function getExitCodes(): (string | number | undefined)[] {
  return exitSpy.mock.calls.map((c: unknown[]) => c[0] as string | number | undefined);
}

// ---------------------------------------------------------------------------
// TC-DR-001: `doctor repair` without slug → error + exit(2)
// ---------------------------------------------------------------------------

describe("TC-DR-001: doctor repair without slug argument", () => {
  it("calls process.exit(2) when no slug is provided", async () => {
    await callDoctorHandler(["repair"]);
    expect(getExitCodes()).toContain(2);
  });

  it("writes an error message mentioning the required slug to stderr", async () => {
    await callDoctorHandler(["repair"]);
    const output = getStderrOutput();
    expect(output).toContain("specrunner doctor repair");
  });
});

// ---------------------------------------------------------------------------
// TC-DR-002: `doctor repair <slug>` success → message + exit(0)
// ---------------------------------------------------------------------------

describe("TC-DR-002: doctor repair <slug> exits with 0 on success", () => {
  it("calls process.exit(0) when repair succeeds", async () => {
    await callDoctorHandler(["repair", "my-slug"]);
    expect(getExitCodes()).toContain(0);
  });

  it("writes the repair result message to stderr", async () => {
    await callDoctorHandler(["repair", "my-slug"]);
    const output = getStderrOutput();
    expect(output).toContain("sidecar repaired successfully");
  });
});

// ---------------------------------------------------------------------------
// TC-DR-003: `doctor repair <slug>` throws → error message + exit(1)
// ---------------------------------------------------------------------------

describe("TC-DR-003: doctor repair <slug> exits with 1 when repair throws", () => {
  it("calls process.exit(1) when repairSlugOccupancySidecar throws", async () => {
    mockRepairFn.mockRejectedValueOnce(new Error("ambiguous: multiple non-terminal jobs"));

    await callDoctorHandler(["repair", "my-slug"]);
    expect(getExitCodes()).toContain(1);
  });

  it("writes the thrown error message to stderr", async () => {
    mockRepairFn.mockRejectedValueOnce(new Error("ambiguous: multiple non-terminal jobs"));

    await callDoctorHandler(["repair", "my-slug"]);
    const output = getStderrOutput();
    expect(output).toContain("ambiguous: multiple non-terminal jobs");
  });
});
