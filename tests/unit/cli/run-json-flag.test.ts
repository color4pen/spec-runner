/**
 * Tests for --json flag acceptance in run / job start / resume CLI commands.
 *
 * TC-JSON-CLI-001: run --json passes json: true to runRunCore
 * TC-JSON-CLI-002: job start --json passes json: true to runRunCore
 * TC-JSON-CLI-003: resume --json passes json: true to runResumeCore
 * TC-JSON-CLI-004: run without --json passes json: false (or undefined)
 * TC-JSON-CLI-005: run --json does not raise Unknown flag error
 * TC-JSON-CLI-006: job start --json does not raise Unknown flag error
 * TC-JSON-CLI-007: resume --json does not raise Unknown flag error
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock before importing main (vitest hoists vi.mock)
// Only the primitives (runRunCore / runResumeCore) are mocked; the registry dispatches through the
// production handler modules (job-start-handler.ts / job-resume-handler.ts), so
// TC-JSON-CLI-001 through 004 assert on the runRunCore/runResumeCore call args those handlers produce.
vi.mock("../../../src/cli/run.js", () => ({
  runRunCore: vi.fn().mockResolvedValue(0),
  handlePostPipelineState: vi.fn(),
}));

vi.mock("../../../src/cli/resume.js", () => ({
  runResumeCore: vi.fn().mockResolvedValue(0),
}));

// Prevent worktree guard from blocking dispatch
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));

// Silence other CLI modules
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn(), handleInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn(), handleLogin: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn(), handleJobLs: vi.fn(), handleJobStats: vi.fn() }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn(), handleDoctor: vi.fn(), handleDoctorRepair: vi.fn(), buildExecFile: vi.fn() }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0), handleJobCancel: vi.fn(), VALID_JOB_ID_CHARS: /^[a-zA-Z0-9_-]+$/ }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn(), handleJobShow: vi.fn() }));
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

// TC-JSON-CLI-001: run --json passes json: true to runRunCore
describe("TC-JSON-CLI-001: run --json passes json: true to runRunCore", () => {
  it("calls runRunCore with json: true when --json is specified", async () => {
    const { runRunCore } = await import("../../../src/cli/run.js");

    await runMain(["run", "my-feature", "--json"]);

    expect(runRunCore).toHaveBeenCalledWith(
      "my-feature",
      expect.objectContaining({ json: true }),
    );
  });
});

// TC-JSON-CLI-002: job start --json passes json: true to runRunCore
describe("TC-JSON-CLI-002: job start --json passes json: true to runRunCore", () => {
  it("calls runRunCore with json: true when job start --json is specified", async () => {
    const { runRunCore } = await import("../../../src/cli/run.js");

    await runMain(["job", "start", "my-feature", "--json"]);

    expect(runRunCore).toHaveBeenCalledWith(
      "my-feature",
      expect.objectContaining({ json: true }),
    );
  });
});

// TC-JSON-CLI-003: resume --json passes json: true to runResumeCore
describe("TC-JSON-CLI-003: resume --json passes json: true to runResumeCore", () => {
  it("calls runResumeCore with json: true when job resume --json is specified", async () => {
    const { runResumeCore } = await import("../../../src/cli/resume.js");

    await runMain(["job", "resume", "my-feature", "--json"]);

    expect(runResumeCore).toHaveBeenCalledWith(
      "my-feature",
      expect.objectContaining({ json: true }),
    );
  });
});

// TC-JSON-CLI-004: run without --json passes json: false
describe("TC-JSON-CLI-004: run without --json passes json: false", () => {
  it("calls runRunCore with json: false when --json is not specified", async () => {
    const { runRunCore } = await import("../../../src/cli/run.js");

    await runMain(["run", "my-feature"]);

    expect(runRunCore).toHaveBeenCalledWith(
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
