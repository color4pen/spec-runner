/**
 * Unit tests for src/util/repo-root.ts
 *
 * TC-RR-001: resolveRepoRoot returns repo root string on success
 * TC-RR-002: resolveRepoRoot returns null when git fails (non-zero exit)
 * TC-RR-003: resolveRepoRoot returns null when spawnCommand throws
 * TC-RR-004: resolveRepoRootOrFail returns repo root string on success
 * TC-RR-005: resolveRepoRootOrFail throws when git fails
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// Mock spawnCommand before importing the module under test
vi.mock("../../../src/util/spawn.js", () => ({
  spawnCommand: vi.fn(),
}));

import { spawnCommand } from "../../../src/util/spawn.js";
import { resolveRepoRoot, resolveRepoRootOrFail } from "../../../src/util/repo-root.js";

const mockSpawnCommand = spawnCommand as ReturnType<typeof vi.fn>;

afterEach(() => {
  vi.clearAllMocks();
});

describe("TC-RR-001: resolveRepoRoot returns repo root string on success", () => {
  it("returns trimmed stdout when git exits 0", async () => {
    mockSpawnCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "/home/user/my-repo\n",
      stderr: "",
    });

    const result = await resolveRepoRoot();
    expect(result).toBe("/home/user/my-repo");
  });
});

describe("TC-RR-002: resolveRepoRoot returns null when git exits non-zero", () => {
  it("returns null when git exits with non-zero code", async () => {
    mockSpawnCommand.mockResolvedValueOnce({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: not a git repository",
    });

    const result = await resolveRepoRoot();
    expect(result).toBeNull();
  });
});

describe("TC-RR-003: resolveRepoRoot returns null when spawnCommand throws", () => {
  it("returns null when spawnCommand throws", async () => {
    mockSpawnCommand.mockRejectedValueOnce(new Error("spawn ENOENT"));

    const result = await resolveRepoRoot();
    expect(result).toBeNull();
  });
});

describe("TC-RR-004: resolveRepoRootOrFail returns repo root string on success", () => {
  it("returns trimmed repo root when git exits 0", async () => {
    mockSpawnCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: "/home/user/my-repo\n",
      stderr: "",
    });

    const result = await resolveRepoRootOrFail();
    expect(result).toBe("/home/user/my-repo");
  });
});

describe("TC-RR-005: resolveRepoRootOrFail throws when git fails", () => {
  it("throws when git exits non-zero", async () => {
    mockSpawnCommand.mockResolvedValueOnce({
      exitCode: 128,
      stdout: "",
      stderr: "fatal: not a git repository",
    });

    await expect(resolveRepoRootOrFail()).rejects.toThrow(
      "Failed to resolve git repo root",
    );
  });

  it("throws when spawnCommand throws", async () => {
    mockSpawnCommand.mockRejectedValueOnce(new Error("spawn ENOENT"));

    await expect(resolveRepoRootOrFail()).rejects.toThrow(
      "Failed to resolve git repo root",
    );
  });
});
