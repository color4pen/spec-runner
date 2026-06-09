/**
 * Dispatch-level tests for --help / -h flag handling.
 *
 * TC-HELP-DISPATCH-01: job archive --help → exit 0 + ARCHIVE_USAGE
 * TC-HELP-DISPATCH-02: runtime reset --help → exit 0 + RUNTIME_RESET_USAGE
 * TC-HELP-DISPATCH-03: job resume --help → exit 0 + fallback (no slug required)
 * TC-HELP-DISPATCH-04: request review --help → exit 0 (no file-or-slug error)
 * TC-HELP-DISPATCH-05: run --help → exit 0 (normal command path)
 * TC-HELP-DISPATCH-06: job resume (no slug, no help) → exit 2 + stderr "requires a <slug>"
 * TC-HELP-DISPATCH-07: job archive -h → exit 0 + ARCHIVE_USAGE (short form)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
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
vi.mock("../../../src/core/command/request-review.js", () => ({
  executeReview: vi.fn().mockResolvedValue(0),
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

// TC-HELP-DISPATCH-03: job resume --help → exit 0 + fallback (runResume not called)
describe("TC-HELP-DISPATCH-03: job resume --help", () => {
  it("exits with code 0 even without slug", async () => {
    const result = await runMain(["job", "resume", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("writes fallback help message (no detailed usage defined)", async () => {
    await runMain(["job", "resume", "--help"]);
    expect(stdoutContains("No detailed help available")).toBe(true);
  });

  it("does not call runResume", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");
    await runMain(["job", "resume", "--help"]);
    expect(runResume).not.toHaveBeenCalled();
  });
});

// TC-HELP-DISPATCH-04: request review --help → exit 0, no "requires a <file-or-slug>" error
describe("TC-HELP-DISPATCH-04: request review --help", () => {
  it("exits with code 0 even without slug/file argument", async () => {
    const result = await runMain(["request", "review", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("does not write 'requires a <file-or-slug>' to stderr", async () => {
    await runMain(["request", "review", "--help"]);
    const stderrOutput = stderrSpy.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join("");
    expect(stderrOutput).not.toContain("requires a <file-or-slug>");
  });
});

// TC-HELP-DISPATCH-05: run --help → exit 0 (normal command path), runRun not called
describe("TC-HELP-DISPATCH-05: run --help (normal command path)", () => {
  it("exits with code 0", async () => {
    const result = await runMain(["run", "--help"]);
    expect(result).toBe("process.exit(0)");
  });

  it("does not call runRun", async () => {
    const { runRun } = await import("../../../src/cli/run.js");
    await runMain(["run", "--help"]);
    expect(runRun).not.toHaveBeenCalled();
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
