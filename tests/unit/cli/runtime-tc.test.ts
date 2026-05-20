/**
 * Tests for runtime commands (renamed from managed).
 *
 * TC-38: runtime status — managed status と同等動作
 * TC-39: runtime reset — managed reset と同等動作
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/core/worktree/detection.js", () => ({
  detectWorktree: vi.fn().mockResolvedValue({ isWorktree: false }),
}));
vi.mock("../../../src/cli/run.js", () => ({ runRun: vi.fn(), handlePostPipelineState: vi.fn() }));
vi.mock("../../../src/cli/finish.js", () => ({ runFinish: vi.fn() }));
vi.mock("../../../src/cli/resume.js", () => ({ runResume: vi.fn() }));
vi.mock("../../../src/cli/ps.js", () => ({ runPs: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/cli/init.js", () => ({ runInit: vi.fn() }));
vi.mock("../../../src/cli/login.js", () => ({ runLogin: vi.fn() }));
vi.mock("../../../src/cli/doctor.js", () => ({ runDoctor: vi.fn() }));
vi.mock("../../../src/cli/rm.js", () => ({ runRm: vi.fn().mockResolvedValue(0) }));
vi.mock("../../../src/cli/job-show.js", () => ({ runJobShow: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/core/command/request-new.js", () => ({ executeNew: vi.fn() }));
vi.mock("../../../src/core/command/request-show.js", () => ({ executeShow: vi.fn() }));
vi.mock("../../../src/core/command/request-rm.js", () => ({ executeRm: vi.fn() }));
vi.mock("../../../src/core/command/request.js", () => ({
  executeTemplate: vi.fn(),
  executeValidate: vi.fn(),
}));
vi.mock("../../../src/core/command/request-review.js", () => ({ executeReview: vi.fn() }));
vi.mock("../../../src/core/command/request-create.js", () => ({ executeCreate: vi.fn() }));
vi.mock("../../../src/core/command/request-list.js", () => ({ executeList: vi.fn() }));

// managed.js mock — we control what gets called
const mockRunManagedStatus = vi.fn().mockResolvedValue(undefined);
const mockRunManagedReset = vi.fn().mockResolvedValue(undefined);
const mockRunManagedSetup = vi.fn().mockResolvedValue(undefined);

vi.mock("../../../src/cli/managed.js", () => ({
  runManagedSetup: mockRunManagedSetup,
  runManagedStatus: mockRunManagedStatus,
  runManagedReset: mockRunManagedReset,
}));

let originalArgv: string[];

beforeEach(() => {
  originalArgv = process.argv;
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  vi.spyOn(process, "exit").mockImplementation((code?: string | number | null) => {
    throw new Error(`process.exit(${code})`);
  });
});

afterEach(() => {
  process.argv = originalArgv;
  vi.restoreAllMocks();
  vi.resetModules();
});

async function runMain(args: string[]): Promise<void> {
  process.argv = ["node", "specrunner", ...args];
  const mod = await import("../../../bin/specrunner.js");
  try {
    await mod.main();
  } catch {
    // process.exit throws in test environment
  }
}

// TC-38: runtime status が runManagedStatus を呼び出す
describe("TC-38: runtime status — runManagedStatus を呼び出す", () => {
  it("specrunner runtime status → runManagedStatus が呼ばれる", async () => {
    await runMain(["runtime", "status"]);
    expect(mockRunManagedStatus).toHaveBeenCalled();
  });
});

// TC-39: runtime reset が runManagedReset を呼び出す
describe("TC-39: runtime reset — runManagedReset を呼び出す", () => {
  it("specrunner runtime reset --force → runManagedReset({ force: true }) が呼ばれる", async () => {
    await runMain(["runtime", "reset", "--force"]);
    expect(mockRunManagedReset).toHaveBeenCalledWith({ force: true });
  });
});
