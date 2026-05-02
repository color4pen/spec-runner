/**
 * Tests for finish command: openspec archive step.
 *
 * TC-024: specs/ has .md files → openspec archive <slug>
 * TC-025: specs/ empty → openspec archive <slug> --skip-specs
 * TC-026: change folder missing → skip entire step
 * TC-043: non-zero exit → escalation
 */
import { describe, it, expect, vi } from "vitest";
import { archiveOpenspec } from "../src/core/finish/archive-openspec.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { FinishFs } from "../src/core/finish/types.js";

function makeSpawn(exitCode: number, stdout = "", stderr = ""): SpawnFn {
  // Both openspec archive and the subsequent git add return the same exit code.
  return vi.fn().mockResolvedValue({ exitCode, stdout, stderr });
}

function makeFs(overrides: Partial<FinishFs> = {}): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const BASE = {
  slug: "my-feature",
  jobId: "test-job-id",
  cwd: "/repo",
};

// TC-024
describe("TC-024: specs/ has .md files → openspec archive <slug>", () => {
  it("calls openspec archive without --skip-specs when specs/ has md files", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockResolvedValue(true),
      readdir: vi.fn().mockResolvedValue(["delta.md", "proposal.md"]),
    });

    const result = await archiveOpenspec({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);

    const callArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[0]).toBe("openspec");
    expect(callArgs[1]).toContain("archive");
    expect(callArgs[1]).toContain("my-feature");
    expect(callArgs[1]).not.toContain("--skip-specs");
  });
});

// TC-025
describe("TC-025: specs/ empty → openspec archive <slug> --skip-specs", () => {
  it("calls openspec archive with --skip-specs when specs/ has no md files", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockResolvedValue(true),
      readdir: vi.fn().mockResolvedValue(["README.txt"]), // no .md files
    });

    const result = await archiveOpenspec({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const callArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[1]).toContain("--skip-specs");
  });

  it("calls openspec archive with --skip-specs when specs/ is empty", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockResolvedValue(true),
      readdir: vi.fn().mockResolvedValue([]), // empty
    });

    const result = await archiveOpenspec({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const callArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[1]).toContain("--skip-specs");
  });
});

// TC-026
describe("TC-026: change folder missing → skip entire step", () => {
  it("skips without calling openspec when change folder does not exist", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockResolvedValue(false), // change folder not found
    });

    const result = await archiveOpenspec({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(true);
    expect(result.message).toContain("skipping");
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });
});

// TC-043
describe("TC-043: openspec non-zero exit → escalation", () => {
  it("returns escalation when openspec exits non-zero", async () => {
    const spawn = makeSpawn(1, "", "openspec: archive failed");
    const fs = makeFs({
      exists: vi.fn().mockResolvedValue(true),
      readdir: vi.fn().mockResolvedValue(["spec.md"]),
    });

    const result = await archiveOpenspec({ ...BASE, spawn, fs });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.exitCode).toBe(1);
    expect(result.escalation).toContain("archive-openspec");
  });
});
