/**
 * Unit tests for archive-change-folder.ts
 *
 * TC-CF-001: change folder exists → git mv succeeds → ok: true, skipped: false
 * TC-CF-002: change folder absent → skip (ok: true, skipped: true)
 * TC-CF-003: git mv fails → escalation
 * TC-CF-004: archive path has YYYY-MM-DD-<slug> format (now injectable)
 * TC-CF-005: now omitted → default Date used (no error)
 */
import { describe, it, expect, vi } from "vitest";
import { archiveChangeFolder } from "../../../../src/core/finish/archive-change-folder.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";
import type { FinishFs } from "../../../../src/core/finish/types.js";

const CWD = "/tmp/repo";
const SLUG = "my-slug";
const FIXED_DATE = "2026-01-15";
const FIXED_NOW = () => new Date(2026, 0, 15, 12, 0, 0);

function makeFs(overrides: Partial<FinishFs> = {}): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

function makeSpawn(exitCode = 0): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout: "", stderr: "" });
}

describe("TC-CF-004: archive path has YYYY-MM-DD-<slug> format when now is injected", () => {
  it("git mv source → specrunner/changes/archive/2026-01-15-my-slug", async () => {
    const spawn = makeSpawn(0);
    const result = await archiveChangeFolder({
      slug: SLUG,
      cwd: CWD,
      spawn,
      fs: makeFs(),
      now: FIXED_NOW,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skipped).toBe(false);
      expect(result.message).toContain(`specrunner/changes/archive/${FIXED_DATE}-${SLUG}`);
    }

    // Verify git mv was called with the dated archive path
    const spawnMock = spawn as ReturnType<typeof vi.fn>;
    const gitMvCall = spawnMock.mock.calls.find(
      (call: unknown[]) => call[0] === "git" && Array.isArray(call[1]) && call[1][0] === "mv",
    );
    expect(gitMvCall).toBeDefined();
    const args = gitMvCall![1] as string[];
    expect(args[2]).toBe(`specrunner/changes/archive/${FIXED_DATE}-${SLUG}`);
  });
});

describe("TC-CF-001: change folder exists → git mv succeeds", () => {
  it("returns ok: true, skipped: false", async () => {
    const result = await archiveChangeFolder({
      slug: SLUG,
      cwd: CWD,
      spawn: makeSpawn(0),
      fs: makeFs(),
      now: FIXED_NOW,
    });

    expect(result).toMatchObject({ ok: true, skipped: false });
  });
});

describe("TC-CF-002: change folder absent → skip", () => {
  it("returns ok: true, skipped: true when change dir does not exist", async () => {
    const result = await archiveChangeFolder({
      slug: SLUG,
      cwd: CWD,
      spawn: makeSpawn(0),
      fs: makeFs({ exists: vi.fn().mockResolvedValue(false) }),
      now: FIXED_NOW,
    });

    expect(result).toMatchObject({ ok: true, skipped: true });
  });
});

describe("TC-CF-003: git mv fails → escalation", () => {
  it("returns ok: false with escalation when git mv exits non-zero", async () => {
    const spawn: SpawnFn = vi.fn().mockResolvedValue({
      exitCode: 1,
      stdout: "",
      stderr: "fatal: could not mv",
    });

    const result = await archiveChangeFolder({
      slug: SLUG,
      cwd: CWD,
      spawn,
      fs: makeFs(),
      now: FIXED_NOW,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.exitCode).toBe(1);
      expect(result.escalation).toContain("archive-change-folder");
    }
  });
});

describe("TC-CF-005: now omitted → default Date used, no error", () => {
  it("resolves without error when now is not provided", async () => {
    const result = await archiveChangeFolder({
      slug: SLUG,
      cwd: CWD,
      spawn: makeSpawn(0),
      fs: makeFs(),
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Archive path should start with a YYYY-MM-DD prefix
      expect(result.message).toMatch(/specrunner\/changes\/archive\/\d{4}-\d{2}-\d{2}-my-slug/);
    }
  });
});
