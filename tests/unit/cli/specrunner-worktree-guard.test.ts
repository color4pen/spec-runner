/**
 * Integration tests for the worktree guard in bin/specrunner.ts
 *
 * TC-WG-001: run from worktree → exit 1 with WORKTREE_GUARD error
 * TC-WG-002: finish from worktree → exit 1 with WORKTREE_GUARD error
 * TC-WG-003: resume from worktree → exit 1 with WORKTREE_GUARD error
 * TC-WG-004: ps from worktree → NOT guarded, proceeds normally
 * TC-WG-005: error message includes hint with main worktree path
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Hoist mocks — vitest requires vi.mock to be at top-level before imports
vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn(),
}));

vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn() }));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResume: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn() }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn() }));
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

// TC-WG-001: run from worktree → rejected
describe("TC-WG-001: run from inside a worktree", () => {
  it("exits with code 1 and prints worktree guard error", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    const result = await runMain(["run", "request.md"]);

    expect(result).toBe("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    const combined = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(combined).toMatch(/cannot be run from inside a worktree/i);
  });
});

// TC-WG-002: finish from worktree → rejected
describe("TC-WG-002: finish from inside a worktree", () => {
  it("exits with code 1 and prints worktree guard error", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    const result = await runMain(["finish"]);

    expect(result).toBe("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    const combined = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(combined).toMatch(/cannot be run from inside a worktree/i);
  });
});

// TC-WG-003: resume from worktree → rejected
describe("TC-WG-003: resume from inside a worktree", () => {
  it("exits with code 1 and prints worktree guard error", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    const result = await runMain(["resume", "my-slug"]);

    expect(result).toBe("process.exit(1)");
    expect(exitSpy).toHaveBeenCalledWith(1);
    const combined = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(combined).toMatch(/cannot be run from inside a worktree/i);
  });
});

// TC-WG-004: ps from worktree → NOT guarded
describe("TC-WG-004: ps from inside a worktree", () => {
  it("does NOT reject ps — proceeds normally", async () => {
    await setWorktreeDetection(true, "/home/user/my-project");

    const result = await runMain(["ps"]);

    // ps should succeed (no process.exit(1))
    expect(result).toBeUndefined();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// TC-WG-005: error hint contains main worktree path
describe("TC-WG-005: worktree guard error hint includes main path", () => {
  it("includes the main worktree path in the hint", async () => {
    const mainPath = "/home/user/projects/my-repo";
    await setWorktreeDetection(true, mainPath);

    await runMain(["run", "request.md"]);

    const combined = (stderrSpy.mock.calls as unknown[][])
      .map((c) => String(c[0]))
      .join("\n");
    expect(combined).toContain(mainPath);
  });
});
