/**
 * Tests for --json flag acceptance in run / job start / resume CLI commands.
 *
 * TC-JSON-CLI-001: run --json passes json: true to runRun
 * TC-JSON-CLI-002: job start --json passes json: true to runRun
 * TC-JSON-CLI-003: resume --json passes json: true to runResume
 * TC-JSON-CLI-004: run without --json passes json: false (or undefined)
 * TC-JSON-CLI-005: run --json does not raise Unknown flag error
 * TC-JSON-CLI-006: job start --json does not raise Unknown flag error
 * TC-JSON-CLI-007: resume --json does not raise Unknown flag error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock before importing main (vitest hoists vi.mock)
vi.mock("../../../src/cli/run.js", () => ({
  runRun: vi.fn().mockResolvedValue(undefined),
  runRunCore: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../../src/cli/resume.js", () => ({
  runResume: vi.fn().mockResolvedValue(undefined),
  runResumeCore: vi.fn().mockResolvedValue(0),
}));

// Prevent worktree guard from blocking dispatch
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));

// Silence other CLI modules
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn() }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn() }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn() }));
vi.mock("../../../src/core/command/request-new.js", () => ({ executeNew: vi.fn() }));

let originalArgv: string[];
let _exitSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalArgv = process.argv;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  _exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runMain(args: string[]) {
  process.argv = ["node", "specrunner", ...args];
  const mod = await import("../../../bin/specrunner.js");
  try {
    await mod.main();
  } catch (err) {
    return (err as Error).message;
  }
}

// TC-JSON-CLI-001: run --json passes json: true to runRun
describe("TC-JSON-CLI-001: run --json passes json: true to runRun", () => {
  it("calls runRun with json: true when --json is specified", async () => {
    const { runRun } = await import("../../../src/cli/run.js");

    await runMain(["run", "my-feature", "--json"]);

    expect(runRun).toHaveBeenCalledWith(
      "my-feature",
      expect.objectContaining({ json: true }),
    );
  });
});

// TC-JSON-CLI-002: job start --json passes json: true to runRun
describe("TC-JSON-CLI-002: job start --json passes json: true to runRun", () => {
  it("calls runRun with json: true when job start --json is specified", async () => {
    const { runRun } = await import("../../../src/cli/run.js");

    await runMain(["job", "start", "my-feature", "--json"]);

    expect(runRun).toHaveBeenCalledWith(
      "my-feature",
      expect.objectContaining({ json: true }),
    );
  });
});

// TC-JSON-CLI-003: resume --json passes json: true to runResume
describe("TC-JSON-CLI-003: resume --json passes json: true to runResume", () => {
  it("calls runResume with json: true when job resume --json is specified", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-feature", "--json"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-feature",
      expect.objectContaining({ json: true }),
    );
  });
});

// TC-JSON-CLI-004: run without --json passes json: false
describe("TC-JSON-CLI-004: run without --json passes json: false", () => {
  it("calls runRun with json: false when --json is not specified", async () => {
    const { runRun } = await import("../../../src/cli/run.js");

    await runMain(["run", "my-feature"]);

    expect(runRun).toHaveBeenCalledWith(
      "my-feature",
      expect.objectContaining({ json: false }),
    );
  });
});

// TC-JSON-CLI-005: run --json does not raise Unknown flag error
describe("TC-JSON-CLI-005: run --json does not raise Unknown flag error", () => {
  it("does not exit with 'Unknown flag' error for run --json", async () => {
    const error = await runMain(["run", "my-feature", "--json"]);
    // Should not be process.exit(2) with Unknown flag error
    if (error) {
      expect(stderrSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Unknown flag"),
      );
    }
    // If no error, the flag was accepted
  });
});

// TC-JSON-CLI-006: job start --json does not raise Unknown flag error
describe("TC-JSON-CLI-006: job start --json does not raise Unknown flag error", () => {
  it("does not exit with 'Unknown flag' error for job start --json", async () => {
    const error = await runMain(["job", "start", "my-feature", "--json"]);
    if (error) {
      expect(stderrSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Unknown flag"),
      );
    }
  });
});

// TC-JSON-CLI-007: resume --json does not raise Unknown flag error
describe("TC-JSON-CLI-007: resume --json does not raise Unknown flag error", () => {
  it("does not exit with 'Unknown flag' error for job resume --json", async () => {
    const error = await runMain(["job", "resume", "my-feature", "--json"]);
    if (error) {
      expect(stderrSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Unknown flag"),
      );
    }
  });
});
