/**
 * T-07: view コマンド（job ls / job stats / job show）の worktree cwd guard テスト
 *
 * detectSpecrunnerWorktree が isSpecrunnerWorktree: true を返す場合:
 *   - runPs / runJobStats / runJobShow が exit code 2 を返す
 *   - JobStateStore.list が呼ばれない
 *   - stderr に main checkout パスへの案内が含まれる
 *
 * detectSpecrunnerWorktree が isSpecrunnerWorktree: false を返す場合:
 *   - runPs は通常フロー（JobStateStore.list 呼び出し）に進む
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the modules under test)
// ---------------------------------------------------------------------------

vi.mock("../../core/worktree/detection.js", () => ({
  detectSpecrunnerWorktree: vi.fn(),
}));

vi.mock("../../store/job-state-store.js", () => ({
  JobStateStore: {
    list: vi.fn().mockResolvedValue([]),
    listWithSourceDirs: vi.fn().mockResolvedValue([]),
    resolveId: vi.fn(),
  },
}));

vi.mock("../../logger/stdout.js", () => ({
  stdoutWrite: vi.fn(),
  stderrWrite: vi.fn(),
  logResult: vi.fn(),
  logError: vi.fn(),
  setLogLevel: vi.fn(),
  getLogLevel: vi.fn().mockReturnValue("default"),
}));

// Mock resolveRepoRoot to avoid git detection in tests
vi.mock("../../util/repo-root.js", () => ({
  resolveRepoRoot: vi.fn().mockResolvedValue("/test-repo"),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { runPs } from "../ps.js";
import { runJobStats } from "../../core/command/job-stats.js";
import { runJobShow } from "../job-show.js";
import { detectSpecrunnerWorktree } from "../../core/worktree/detection.js";
import { JobStateStore } from "../../store/job-state-store.js";
import { stderrWrite } from "../../logger/stdout.js";

const mockDetect = detectSpecrunnerWorktree as ReturnType<typeof vi.fn>;
const mockList = JobStateStore.list as ReturnType<typeof vi.fn>;
const mockListWithSourceDirs = JobStateStore.listWithSourceDirs as ReturnType<typeof vi.fn>;
const mockStderrWrite = stderrWrite as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Worktree cwd guard — isSpecrunnerWorktree: true
// ---------------------------------------------------------------------------

describe("worktree cwd guard fires (isSpecrunnerWorktree: true)", () => {
  beforeEach(() => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: "/repo" });
  });

  it("runPs returns exit code 2", async () => {
    const code = await runPs({});
    expect(code).toBe(2);
  });

  it("runPs does not call JobStateStore.list", async () => {
    await runPs({});
    expect(mockList).not.toHaveBeenCalled();
  });

  it("runPs writes main checkout path to stderr", async () => {
    await runPs({});
    const allWrites = mockStderrWrite.mock.calls.map((c: unknown[]) => c[0] as string).join("\n");
    expect(allWrites).toContain("/repo");
  });

  it("runJobStats returns exit code 2", async () => {
    const code = await runJobStats({ cwd: process.cwd(), json: false });
    expect(code).toBe(2);
  });

  it("runJobStats does not call JobStateStore.listWithSourceDirs", async () => {
    await runJobStats({ cwd: process.cwd(), json: false });
    expect(mockListWithSourceDirs).not.toHaveBeenCalled();
  });

  it("runJobStats writes main checkout path to stderr", async () => {
    await runJobStats({ cwd: process.cwd(), json: false });
    const allWrites = mockStderrWrite.mock.calls.map((c: unknown[]) => c[0] as string).join("\n");
    expect(allWrites).toContain("/repo");
  });

  it("runJobShow returns exit code 2", async () => {
    const code = await runJobShow("some-slug");
    expect(code).toBe(2);
  });

  it("runJobShow does not call JobStateStore.list", async () => {
    await runJobShow("some-slug");
    expect(mockList).not.toHaveBeenCalled();
  });

  it("runJobShow writes main checkout path to stderr", async () => {
    await runJobShow("some-slug");
    const allWrites = mockStderrWrite.mock.calls.map((c: unknown[]) => c[0] as string).join("\n");
    expect(allWrites).toContain("/repo");
  });
});

// ---------------------------------------------------------------------------
// Normal flow — isSpecrunnerWorktree: false
// ---------------------------------------------------------------------------

describe("normal flow (isSpecrunnerWorktree: false)", () => {
  beforeEach(() => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: false });
    mockList.mockResolvedValue([]);
  });

  it("runPs proceeds to JobStateStore.list", async () => {
    await runPs({ repoRoot: "/test-repo" });
    expect(mockList).toHaveBeenCalled();
  });
});
