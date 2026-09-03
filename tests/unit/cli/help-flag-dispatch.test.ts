/**
 * Dispatch-level tests for --help / -h flag handling.
 *
 * TC-HELP-DISPATCH-01: job archive --help → exit 0 + ARCHIVE_USAGE
 * TC-HELP-DISPATCH-02: runtime reset --help → exit 0 + RUNTIME_RESET_USAGE
 * TC-HELP-DISPATCH-03: job resume --help → exit 0 + fallback (no slug required)
 * TC-HELP-DISPATCH-05: run --help → exit 0 (normal command path)
 * TC-HELP-DISPATCH-06: job resume (no slug, no help) → exit 2 + stderr "requires a <slug>"
 * TC-HELP-DISPATCH-07: job archive -h → exit 0 + ARCHIVE_USAGE (short form)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
// TC-HELP-DISPATCH-06: handleJobResume stub must exit 2 + write "requires a <slug>" to stderr.
// SpecRunnerError with exitCode 2 is used (instead of FlagParseError) to avoid module-isolation
// instanceof issues; the dispatch writes e.message to stderr and exits with e.exitCode.
// TC-HELP-DISPATCH-06: use importOriginal so the real handleJobResume (which throws FlagParseError
// from the same flag-parser.js instance as bin/specrunner.ts) is used. Only runResumeCore is stubbed.
vi.mock("../../../src/cli/resume.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../src/cli/resume.js")>();
  return { ...actual, runResumeCore: vi.fn().mockResolvedValue(0) };
});
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(0), handleJobLs: vi.fn(), handleJobStats: vi.fn() }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn().mockResolvedValue(0), handleInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0), handleLogin: vi.fn() }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn().mockResolvedValue(0), handleDoctor: vi.fn(), handleDoctorRepair: vi.fn(), buildExecFile: vi.fn() }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0), handleJobCancel: vi.fn(), VALID_JOB_ID_CHARS: /^[a-zA-Z0-9_-]+$/ }));
vi.mock("../../../src/cli/archive.js", () => ({ runArchive: vi.fn().mockResolvedValue(0), handleJobArchive: vi.fn(), ARCHIVE_USAGE: "Archive the completed change folder" }));
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

let originalArgv: string[];
let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalArgv = process.argv;
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.resetModules();
});

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

function stdoutContains(substring: string): boolean {
  return stdoutSpy.mock.calls.some(
    (call: unknown[]) => typeof call[0] === "string" && call[0].includes(substring),
  );
}

// TC-HELP-DISPATCH-01: job archive --help → exit 0 + ARCHIVE_USAGE
describe("TC-HELP-DISPATCH-01: job archive --help", () => {
  it("exits with code 0", async () => {
    const result = await runMain(["job", "archive", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("writes ARCHIVE_USAGE to stdout", async () => {
    await runMain(["job", "archive", "--help"]);
    expect(stdoutContains("Archive the completed change folder")).toBe(true);
  });

  it("does not call runArchive", async () => {
    const { runArchive } = await import("../../../src/cli/archive.js");
    await runMain(["job", "archive", "--help"]);
    expect(runArchive).not.toHaveBeenCalled();
  });
});

// TC-HELP-DISPATCH-02: runtime reset --help → exit 0 + RUNTIME_RESET_USAGE
describe("TC-HELP-DISPATCH-02: runtime reset --help", () => {
  it("exits with code 0", async () => {
    const result = await runMain(["runtime", "reset", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("writes RUNTIME_RESET_USAGE to stdout", async () => {
    await runMain(["runtime", "reset", "--help"]);
    expect(stdoutContains("Delete the Anthropic Environment")).toBe(true);
  });

  it("does not call runManagedReset", async () => {
    const { runManagedReset } = await import("../../../src/cli/managed.js");
    await runMain(["runtime", "reset", "--help"]);
    expect(runManagedReset).not.toHaveBeenCalled();
  });
});

// TC-HELP-DISPATCH-03: job resume --help → exit 0 + detailed help (runResumeCore not called)
// Updated: JOB_RESUME_USAGE is now wired into the resume entry, so detailed help is shown.
// The old "No detailed help available" assertion is replaced with new-behavior assertions.
describe("TC-HELP-DISPATCH-03: job resume --help", () => {
  it("exits with code 0 even without slug", async () => {
    const result = await runMain(["job", "resume", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("writes detailed help (JOB_RESUME_USAGE) to stdout — not the fallback message", async () => {
    await runMain(["job", "resume", "--help"]);
    // JOB_RESUME_USAGE is now wired; detailed help must be shown.
    expect(stdoutContains("No detailed help available")).toBe(false);
    expect(stdoutContains("--from")).toBe(true);
    expect(stdoutContains("--apply-canon")).toBe(true);
  });

  it("does not call runResumeCore", async () => {
    const { runResumeCore } = await import("../../../src/cli/resume.js");
    await runMain(["job", "resume", "--help"]);
    expect(runResumeCore).not.toHaveBeenCalled();
  });
});

// TC-HELP-DISPATCH-05: run --help → exit 0 (normal command path), runRunCore not called
describe("TC-HELP-DISPATCH-05: run --help (normal command path)", () => {
  it("exits with code 0", async () => {
    const result = await runMain(["run", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("does not call runRunCore", async () => {
    const { runRunCore } = await import("../../../src/cli/run.js");
    await runMain(["run", "--help"]);
    expect(runRunCore).not.toHaveBeenCalled();
  });
});

// TC-HELP-DISPATCH-06: job resume (no slug, no help) → exit 2 + stderr "requires a <slug>"
describe("TC-HELP-DISPATCH-06: job resume without slug and without --help", () => {
  it("exits with code 2", async () => {
    const result = await runMain(["job", "resume"]);
    expect(result).toBe("process.exit(2)");
  });

  it("writes 'requires a <slug>' to stderr", async () => {
    await runMain(["job", "resume"]);
    const stderrOutput = stderrSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");
    expect(stderrOutput).toContain("requires a <slug>");
  });
});

// TC-HELP-DISPATCH-07: job archive -h → exit 0 + ARCHIVE_USAGE (short form)
describe("TC-HELP-DISPATCH-07: job archive -h (short form)", () => {
  it("exits with code 0", async () => {
    const result = await runMain(["job", "archive", "-h"]);
    expect(result).toBe("process.exit(0)");
  });

  it("writes ARCHIVE_USAGE to stdout", async () => {
    await runMain(["job", "archive", "-h"]);
    expect(stdoutContains("Archive the completed change folder")).toBe(true);
  });
});

// TC-HELP-DISPATCH-08: pure parent --help → exit 0 + subcommand listing (not NO_DETAILED_HELP_USAGE)
describe("TC-HELP-DISPATCH-08: job --help (pure parent with no help.detail)", () => {
  it("exits with code 0", async () => {
    const result = await runMain(["job", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("does not show the generic fallback message", async () => {
    await runMain(["job", "--help"]);
    expect(stdoutContains("No detailed help available")).toBe(false);
  });

  it("lists available subcommands in stdout", async () => {
    await runMain(["job", "--help"]);
    // Generated fallback: "Usage: specrunner job <start|ls|...>"
    expect(stdoutContains("specrunner job")).toBe(true);
  });
});
