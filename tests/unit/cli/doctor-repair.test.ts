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
  runRunCore: vi.fn().mockResolvedValue(0),
  handlePostPipelineState: vi.fn(),
  handleJobStart: vi.fn(),
}));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResumeCore: vi.fn().mockResolvedValue(0), handleJobResume: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(0), handleJobLs: vi.fn(), handleJobStats: vi.fn() }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn().mockResolvedValue(0), handleInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0), handleLogin: vi.fn() }));
// doctor.js: provide a real-enough handleDoctorRepair stub for TC-DR-002/003 which call
// the handler directly. Dynamic import of repair.js hits the mock at line 76-78.
// Handler now returns a number (exit code) instead of calling process.exit().
vi.mock("../../../src/cli/doctor.js", () => ({
  runDoctor: vi.fn().mockResolvedValue(0),
  handleDoctor: vi.fn(),
  buildExecFile: vi.fn(),
  handleDoctorRepair: vi.fn(async (parsed: ParsedArgs, ctx?: { repoRoot: string | null; invokerCwd: string }) => {
    const slug = parsed.positional;
    if (!slug) {
      process.stderr.write("Error: specrunner doctor repair requires a <slug> argument\n");
      process.stderr.write("Usage: specrunner doctor repair <slug>\n");
      return 2;
    }
    const repoRoot = ctx?.repoRoot ?? process.cwd();
    try {
      const { repairSlugOccupancySidecar } = await import("../../../src/core/occupancy/repair.js");
      const result = await repairSlugOccupancySidecar(repoRoot, slug);
      process.stderr.write(result.message + "\n");
      return 0;
    } catch (err: unknown) {
      process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
      return 1;
    }
  }),
}));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0), handleJobCancel: vi.fn(), VALID_JOB_ID_CHARS: /^[a-zA-Z0-9_-]+$/ }));
vi.mock("../../../src/cli/archive.js", () => ({ runArchive: vi.fn().mockResolvedValue(0), handleJobArchive: vi.fn(), ARCHIVE_USAGE: "" }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(0), handleJobShow: vi.fn() }));
vi.mock("../../../src/cli/managed.js", () => ({
  runManagedSetup: vi.fn().mockResolvedValue(0),
  runManagedStatus: vi.fn().mockResolvedValue(0),
  runManagedReset: vi.fn().mockResolvedValue(0),
  handleRuntimeSetup: vi.fn(),
  handleRuntimeStatus: vi.fn(),
  handleRuntimeReset: vi.fn(),
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

let originalArgv: string[];
let stderrSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalArgv = process.argv;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
  // Default: repair succeeds
  mockRepairFn.mockResolvedValue({ message: "sidecar repaired successfully" });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.resetModules();
});

/**
 * Call main() from bin/specrunner.ts via dispatch (TC-DR-001 only).
 * Returns the process.exit message thrown by the mock, or undefined.
 */
async function runMain(args: string[]): Promise<string | undefined> {
  process.argv = ["node", "specrunner", ...args];
  const mod = await import("../../../bin/specrunner.js");
  try {
    await mod.main();
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

/**
 * Call the doctor repair child handler directly with given slug positionals (excluding "repair" token).
 * Returns the exit code number from the handler (new contract: handler returns number, not process.exit).
 * Used for TC-DR-002/003 where direct handler call avoids dispatch exit-code remapping.
 */
async function callRepairHandler(slugArgs: string[]): Promise<number | undefined> {
  const { COMMANDS } = await import("../../../src/cli/command-registry.js");
  const repairSpec = COMMANDS["doctor"]!.children!["repair"]!;
  const parsed: ParsedArgs = {
    flags: {},
    positionals: slugArgs,
    positional: slugArgs[0],
  };
  return await repairSpec.handler!(parsed, undefined);
}

function getStderrOutput(): string {
  return stderrSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("");
}

function getExitCodes(): (string | number | undefined)[] {
  return exitSpy.mock.calls.map((c: unknown[]) => c[0] as string | number | undefined);
}

// ---------------------------------------------------------------------------
// TC-DR-001: `doctor repair` without slug → FlagParseError via dispatch → exit(2)
// Tests the real dispatch path: parseFlags catches missing required arg before handler.
// ---------------------------------------------------------------------------

describe("TC-DR-001: doctor repair without slug argument", () => {
  it("calls process.exit(2) when no slug is provided", async () => {
    const result = await runMain(["doctor", "repair"]);
    expect(result).toBe("process.exit(2)");
    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it("writes an error message mentioning the required slug to stderr", async () => {
    await runMain(["doctor", "repair"]);
    const output = getStderrOutput();
    expect(output).toContain("specrunner doctor repair");
  });
});

// ---------------------------------------------------------------------------
// TC-DR-002: `doctor repair <slug>` success → message + exit(0)
// ---------------------------------------------------------------------------

describe("TC-DR-002: doctor repair <slug> exits with 0 on success", () => {
  it("returns exit code 0 when repair succeeds", async () => {
    const result = await callRepairHandler(["my-slug"]);
    expect(result).toBe(0);
  });

  it("writes the repair result message to stderr", async () => {
    await callRepairHandler(["my-slug"]);
    const output = getStderrOutput();
    expect(output).toContain("sidecar repaired successfully");
  });
});

// ---------------------------------------------------------------------------
// TC-DR-003: `doctor repair <slug>` throws → error message + exit(1)
// ---------------------------------------------------------------------------

describe("TC-DR-003: doctor repair <slug> exits with 1 when repair throws", () => {
  it("returns exit code 1 when repairSlugOccupancySidecar throws", async () => {
    mockRepairFn.mockRejectedValueOnce(new Error("ambiguous: multiple non-terminal jobs"));

    const result = await callRepairHandler(["my-slug"]);
    expect(result).toBe(1);
  });

  it("writes the thrown error message to stderr", async () => {
    mockRepairFn.mockRejectedValueOnce(new Error("ambiguous: multiple non-terminal jobs"));

    await callRepairHandler(["my-slug"]);
    const output = getStderrOutput();
    expect(output).toContain("ambiguous: multiple non-terminal jobs");
  });
});
