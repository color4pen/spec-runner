/**
 * Tests for finish command: archive change folder step.
 *
 * TC-CF-001: change folder exists → git mv succeeds → ok: true, skipped: false
 * TC-CF-002: change folder absent → skip (ok: true, skipped: true)
 * TC-CF-003: git mv fails → escalation
 * TC-CF-004: git add fails after git mv → escalation
 */
import { describe, it, expect, vi } from "vitest";
import { archiveChangeFolder } from "../src/core/finish/archive-change-folder.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { FinishFs } from "../src/core/finish/types.js";
import { changeFolderPath, changesDirRel } from "../src/util/paths.js";

function makeSpawn(exitCode: number, stdout = "", stderr = ""): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout, stderr });
}

function makeSpawnSequence(results: Array<{ exitCode: number; stdout?: string; stderr?: string }>): SpawnFn {
  const fn = vi.fn();
  for (const result of results) {
    fn.mockResolvedValueOnce({ exitCode: result.exitCode, stdout: result.stdout ?? "", stderr: result.stderr ?? "" });
  }
  return fn;
}

function makeFs(overrides: Partial<FinishFs> = {}): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(""),
    ...overrides,
  };
}

const FIXED_DATE = "2026-01-15";
const FIXED_NOW = () => new Date(`${FIXED_DATE}T12:00:00Z`);

const BASE = {
  slug: "my-feature",
  cwd: "/repo",
  now: FIXED_NOW,
};

// TC-CF-001
describe("TC-CF-001: change folder exists → git mv succeeds", () => {
  it("returns ok: true, skipped: false and calls git mv + git add", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({ exists: vi.fn().mockResolvedValue(true) });

    const result = await archiveChangeFolder({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);
    expect(result.message).toContain("my-feature");

    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    // First call: git mv
    expect(calls[0]![0]).toBe("git");
    expect(calls[0]![1]).toContain("mv");
    expect(calls[0]![1]).toContain(changeFolderPath("my-feature"));
    expect(calls[0]![1]).toContain(`${changesDirRel()}/archive/${FIXED_DATE}-my-feature`);

    // Second call: git add
    expect(calls[1]![0]).toBe("git");
    expect(calls[1]![1]).toContain("add");
    expect(calls[1]![1]).toContain(`${changesDirRel()}/`);
  });
});

// TC-CF-002
describe("TC-CF-002: change folder absent → skip", () => {
  it("returns ok: true, skipped: true without calling git", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({ exists: vi.fn().mockResolvedValue(false) });

    const result = await archiveChangeFolder({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("skipping");
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// TC-CF-003
describe("TC-CF-003: git mv fails → escalation", () => {
  it("returns escalation when git mv exits non-zero", async () => {
    const spawn = makeSpawn(1, "", "fatal: not a git repository");
    const fs = makeFs({ exists: vi.fn().mockResolvedValue(true) });

    const result = await archiveChangeFolder({ ...BASE, spawn, fs });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("archive-change-folder");
  });
});

// TC-CF-004
describe("TC-CF-004: git add fails after git mv → escalation", () => {
  it("returns escalation when git add exits non-zero", async () => {
    const spawn = makeSpawnSequence([
      { exitCode: 0 }, // git mv succeeds
      { exitCode: 1, stderr: "git add failed" }, // git add fails
    ]);
    const fs = makeFs({ exists: vi.fn().mockResolvedValue(true) });

    const result = await archiveChangeFolder({ ...BASE, spawn, fs });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("archive-change-folder");
  });
});
