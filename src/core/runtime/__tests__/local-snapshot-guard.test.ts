/**
 * Unit tests for LocalRuntime.snapshotMainCheckoutGuard.
 *
 * detectSpecrunnerWorktree is mocked to isolate filesystem detection.
 * spawnFn is injected to control git status output.
 * Covers the main paths required by the changed-line coverage gate.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import * as os from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { LocalRuntime } from "../local.js";
import { detectSpecrunnerWorktree } from "../../worktree/detection.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";
import type { SpawnFn } from "../../../util/spawn.js";

vi.mock("../../worktree/detection.js", () => ({
  detectSpecrunnerWorktree: vi.fn(),
}));

const mockDetect = vi.mocked(detectSpecrunnerWorktree);

function makeRuntime(spawnFn?: SpawnFn) {
  return new LocalRuntime({
    cwd: "/tmp/fake-repo",
    githubClient: {} as never,
    spawnFn,
  });
}

function makeConfig(): SpecRunnerConfig {
  return {} as SpecRunnerConfig;
}

function makeSpawn(exitCode: number | null, stdout: string): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout, stderr: "" }) as unknown as SpawnFn;
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// non-specrunner-worktree → null
// ---------------------------------------------------------------------------

describe("snapshotMainCheckoutGuard — non-worktree paths", () => {
  it("detectSpecrunnerWorktree returns false → null", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: false });
    const result = await makeRuntime().snapshotMainCheckoutGuard("/tmp/fake", makeConfig());
    expect(result).toBeNull();
  });

  it("isSpecrunnerWorktree true but mainCheckoutPath absent → null", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: undefined });
    const result = await makeRuntime().snapshotMainCheckoutGuard("/tmp/fake", makeConfig());
    expect(result).toBeNull();
  });

  it("detectSpecrunnerWorktree throws → null (fail-open)", async () => {
    mockDetect.mockRejectedValue(new Error("realpath failed"));
    const result = await makeRuntime().snapshotMainCheckoutGuard("/tmp/fake", makeConfig());
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// git status failures
// ---------------------------------------------------------------------------

describe("snapshotMainCheckoutGuard — git status failures", () => {
  it("git status exits non-zero → null", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: "/tmp/main" });
    const result = await makeRuntime(makeSpawn(128, "")).snapshotMainCheckoutGuard("/tmp/wt", makeConfig());
    expect(result).toBeNull();
  });

  it("git status exits null → null", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: "/tmp/main" });
    const result = await makeRuntime(makeSpawn(null, "")).snapshotMainCheckoutGuard("/tmp/wt", makeConfig());
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// git status succeeds — entry filtering
// ---------------------------------------------------------------------------

describe("snapshotMainCheckoutGuard — entry filtering", () => {
  it("git status clean (empty output) → entries: []", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: "/tmp/main" });
    const result = await makeRuntime(makeSpawn(0, "")).snapshotMainCheckoutGuard("/tmp/wt", makeConfig());
    expect(result).toEqual({ entries: [] });
  });

  it("unmonitored path change → filtered out, entries: []", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: "/tmp/main" });
    // specrunner/drafts/ does not match .specrunner/** (no leading dot)
    const stdout = " M specrunner/drafts/foo.md\0";
    const result = await makeRuntime(makeSpawn(0, stdout)).snapshotMainCheckoutGuard("/tmp/wt", makeConfig());
    expect(result).toEqual({ entries: [] });
  });

  it("staged delete of monitored path → entry with hash null", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: "/tmp/main" });
    // XY = "D " (D in X position = staged delete), space separator, then path
    const stdout = "D  .specrunner/config.json\0";
    const result = await makeRuntime(makeSpawn(0, stdout)).snapshotMainCheckoutGuard("/tmp/wt", makeConfig());
    expect(result).toEqual({ entries: [{ path: ".specrunner/config.json", hash: null }] });
  });

  it("unstaged delete of monitored path → entry with hash null", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: "/tmp/main" });
    // XY = " D" (D in Y position = unstaged delete)
    const stdout = " D .specrunner/config.json\0";
    const result = await makeRuntime(makeSpawn(0, stdout)).snapshotMainCheckoutGuard("/tmp/wt", makeConfig());
    expect(result).toEqual({ entries: [{ path: ".specrunner/config.json", hash: null }] });
  });

  it("modified monitored path, file unreadable → entry with hash null", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: "/tmp/main" });
    const stdout = " M .specrunner/config.json\0";
    const result = await makeRuntime(makeSpawn(0, stdout)).snapshotMainCheckoutGuard("/tmp/wt", makeConfig());
    // /tmp/main/.specrunner/config.json does not exist → catch → hash null
    expect(result).toEqual({ entries: [{ path: ".specrunner/config.json", hash: null }] });
  });

  it("modified monitored path, file readable → entry with sha256 hash", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "sr-snap-test-"));
    try {
      const configDir = path.join(tmpDir, ".specrunner");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(path.join(configDir, "config.json"), '{"version":1}');

      mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: tmpDir });
      const stdout = " M .specrunner/config.json\0";
      const result = await makeRuntime(makeSpawn(0, stdout)).snapshotMainCheckoutGuard("/tmp/wt", makeConfig());
      expect(result?.entries).toHaveLength(1);
      expect(result?.entries[0]?.hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("multiple entries — mix of monitored and unmonitored → only monitored returned", async () => {
    mockDetect.mockResolvedValue({ isSpecrunnerWorktree: true, mainCheckoutPath: "/tmp/main" });
    const stdout = [
      " M specrunner/drafts/foo.md",          // unmonitored
      "D  .specrunner/config.json",            // monitored, deleted
    ].join("\0") + "\0";
    const result = await makeRuntime(makeSpawn(0, stdout)).snapshotMainCheckoutGuard("/tmp/wt", makeConfig());
    expect(result?.entries).toEqual([{ path: ".specrunner/config.json", hash: null }]);
  });
});
