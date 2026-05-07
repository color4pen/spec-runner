/**
 * Tests for bin/specrunner.ts resume case — argument parsing
 *
 * TC-DISPATCH-001: resume with valid slug → calls runResume with slug
 * TC-DISPATCH-002: resume without slug → exit 2
 * TC-DISPATCH-003: resume with --from=critic → passes from: "critic"
 * TC-DISPATCH-004: resume with --from=fixer → passes from: "fixer"
 * TC-DISPATCH-005: resume with --from=creator → passes from: "creator"
 * TC-DISPATCH-006: resume with invalid --from value → exit 2
 * TC-DISPATCH-007: resume with --force → passes force: true
 * TC-DISPATCH-008: resume with unknown flag → exit 2
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must mock runResume BEFORE importing main, since vitest hoists vi.mock
vi.mock("../../../src/cli/resume.js", () => ({
  runResume: vi.fn().mockResolvedValue(undefined),
}));

// Mock all other CLI commands to avoid side effects
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn() }));
vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn() }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn() }));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/rm.js", () => ({ runRm: vi.fn() }));

let originalArgv: string[];
let exitSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  originalArgv = process.argv;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  exitSpy = vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
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
  // Reset module to pick up fresh mocks
  const mod = await import("../../../bin/specrunner.js");
  try {
    await mod.main();
  } catch (err) {
    // process.exit throws
    return (err as Error).message;
  }
}

// TC-DISPATCH-001: resume with valid slug → calls runResume
describe("TC-DISPATCH-001: resume with valid slug", () => {
  it("calls runResume with the slug argument", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["resume", "my-feature-slug"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-feature-slug",
      expect.objectContaining({ from: undefined, force: false, verbose: false }),
    );
  });
});

// TC-DISPATCH-002: resume without slug → exit 2
describe("TC-DISPATCH-002: resume without slug", () => {
  it("exits with code 2 when no slug is provided", async () => {
    const error = await runMain(["resume"]);
    expect(error).toBe("process.exit(2)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("requires a <slug>"));
  });
});

// TC-DISPATCH-003: resume with --from=critic
describe("TC-DISPATCH-003: --from=critic", () => {
  it("passes from: 'critic' to runResume", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["resume", "my-slug", "--from=critic"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ from: "critic" }),
    );
  });
});

// TC-DISPATCH-004: resume with --from=fixer
describe("TC-DISPATCH-004: --from=fixer", () => {
  it("passes from: 'fixer' to runResume", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["resume", "my-slug", "--from=fixer"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ from: "fixer" }),
    );
  });
});

// TC-DISPATCH-005: resume with --from=creator
describe("TC-DISPATCH-005: --from=creator", () => {
  it("passes from: 'creator' to runResume", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["resume", "my-slug", "--from=creator"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ from: "creator" }),
    );
  });
});

// TC-DISPATCH-006: resume with invalid --from value → exit 2
describe("TC-DISPATCH-006: invalid --from value", () => {
  it("exits with code 2 for invalid --from value", async () => {
    const error = await runMain(["resume", "my-slug", "--from=invalid"]);
    expect(error).toBe("process.exit(2)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid --from value"));
  });
});

// TC-DISPATCH-007: resume with --force → passes force: true
describe("TC-DISPATCH-007: --force flag", () => {
  it("passes force: true to runResume", async () => {
    const { runResume } = await import("../../../src/cli/resume.js");

    await runMain(["resume", "my-slug", "--force"]);

    expect(runResume).toHaveBeenCalledWith(
      "my-slug",
      expect.objectContaining({ force: true }),
    );
  });
});

// TC-DISPATCH-008: resume with unknown flag → exit 2
describe("TC-DISPATCH-008: unknown flag", () => {
  it("exits with code 2 for unknown flags", async () => {
    const error = await runMain(["resume", "my-slug", "--unknown-flag"]);
    expect(error).toBe("process.exit(2)");
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Unknown flag(s)"));
  });
});
