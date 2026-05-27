/**
 * Integration tests for the worktree guard in bin/specrunner.ts
 *
 * TC-WG-001: job start from worktree → exit 1 with WORKTREE_GUARD error
 * TC-WG-002: job finish from worktree → exit 1 with WORKTREE_GUARD error
 * TC-WG-003: job resume from worktree → exit 1 with WORKTREE_GUARD error
 * TC-WG-004: job ls from worktree → NOT guarded, proceeds normally
 * TC-WG-005: error message includes hint with main worktree path
 * TC-WG-006: run alias from worktree → exit 1 (top-level guard)
 * TC-WG-007: job rm from worktree → NOT guarded
 * TC-WG-008: job show from worktree → NOT guarded
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoist mocks — vitest requires vi.mock to be at top-level before imports
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn(),
}));

vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn() }));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResume: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn() }));
vi.mock("../../../src/cli/cancel.js", () => ({ runCancel: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/core/command/request-new.js", () => ({ executeNew: vi.fn() }));

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

async function setWorktreeDetection(isWorktree: boolean, mainWorktreePath?: string) {
  const { detectWorktree } = await import("../../../src/core/worktree/detection.js");
  (detectWorktree as ReturnType<typeof vi.fn>).mockResolvedValue({ isWorktree, mainWorktreePath });
}

// TC-WG-001: job start from worktree → rejected with exit 2 (ARG_ERROR)
describe("TC-WG-001: job start from inside a worktree", () => {
  it("exits with code 2 and prints worktree guard error", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    const result = await runMain(["job", "start", "request.md"]);

    expect(result).toBe("process.exit(2)");
    expect(exitSpy).toHaveBeenCalledWith(2);
    const combined = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(combined).toMatch(/cannot be run from inside a worktree/i);
  });
});

// TC-WG-002: job finish from worktree → rejected with exit 2 (ARG_ERROR)
describe("TC-WG-002: job finish from inside a worktree", () => {
  it("exits with code 2 and prints worktree guard error", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    const result = await runMain(["job", "finish"]);

    expect(result).toBe("process.exit(2)");
    expect(exitSpy).toHaveBeenCalledWith(2);
    const combined = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(combined).toMatch(/cannot be run from inside a worktree/i);
  });
});

// TC-WG-003: job resume from worktree → rejected with exit 2 (ARG_ERROR)
describe("TC-WG-003: job resume from inside a worktree", () => {
  it("exits with code 2 and prints worktree guard error", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    const result = await runMain(["job", "resume", "my-slug"]);

    expect(result).toBe("process.exit(2)");
    expect(exitSpy).toHaveBeenCalledWith(2);
    const combined = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(combined).toMatch(/cannot be run from inside a worktree/i);
  });
});

// TC-WG-004: job ls from worktree → NOT guarded (not blocked by worktree guard)
describe("TC-WG-004: job ls from inside a worktree", () => {
  it("does NOT reject job ls — no worktree guard error in stderr", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    await runMain(["job", "ls"]);

    // job ls should not be blocked by worktree guard
    const stderrOutput = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(stderrOutput).not.toMatch(/cannot be run from inside a worktree/i);
  });
});

// TC-WG-005: error hint contains main worktree path
describe("TC-WG-005: worktree guard error hint includes main path", () => {
  it("includes the main worktree path in the hint", async () => {
    const mainPath = "/home/user/projects/my-repo";
    await setWorktreeDetection(true, mainPath);

    await runMain(["job", "start", "request.md"]);

    const combined = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(combined).toContain(mainPath);
  });
});

// TC-WG-006: run alias from worktree → rejected with exit 2 (WORKTREE_GUARD → ARG_ERROR)
describe("TC-WG-006: run alias from inside a worktree", () => {
  it("exits with code 2 via top-level WORKTREE_GUARDED_COMMANDS (WORKTREE_GUARD → ARG_ERROR)", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    const result = await runMain(["run", "request.md"]);

    expect(result).toBe("process.exit(2)");
    expect(exitSpy).toHaveBeenCalledWith(2);
    const combined = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(combined).toMatch(/cannot be run from inside a worktree/i);
  });
});

// TC-WG-007: job cancel from worktree → NOT guarded
describe("TC-WG-007: job cancel from inside a worktree", () => {
  it("does NOT reject job cancel — proceeds normally", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    // job cancel with --all-terminated so no UUID required
    const result = await runMain(["job", "cancel", "--all-terminated", "--yes"]);

    // Should not exit(1) due to worktree guard
    const stderrOutput = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(stderrOutput).not.toMatch(/cannot be run from inside a worktree/i);
  });
});

// TC-WG-008: job show from worktree → NOT guarded
describe("TC-WG-008: job show from inside a worktree", () => {
  it("does NOT reject job show — proceeds normally", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    const result = await runMain(["job", "show", "my-slug"]);

    // Should not exit(1) due to worktree guard
    const stderrOutput = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(stderrOutput).not.toMatch(/cannot be run from inside a worktree/i);
  });
});
