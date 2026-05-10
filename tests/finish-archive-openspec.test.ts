/**
 * Tests for finish command: openspec archive step.
 *
 * TC-024: specs/ has nested/flat .md files → openspec archive <slug>
 * TC-025: specs/ empty → openspec archive <slug> --skip-specs
 * TC-026: change folder missing → skip entire step
 * TC-043: non-zero exit → escalation
 * TC-024b: nested specs/<name>/spec.md → no --skip-specs
 * TC-024c: flat specs/*.md fallback → no --skip-specs
 * TC-025b: directory without spec.md → --skip-specs
 * TC-025c: mixed layout → no --skip-specs (at least one spec)
 */
import { describe, it, expect, vi } from "vitest";
import { archiveOpenspec } from "../src/core/finish/archive-openspec.js";
import type { SpawnFn } from "../src/util/spawn.js";
import type { FinishFs } from "../src/core/finish/types.js";
import { changeFolderPath } from "../src/util/paths.js";

function makeSpawn(exitCode: number, stdout = "", stderr = ""): SpawnFn {
  // Both openspec archive and the subsequent git add return the same exit code.
  return vi.fn().mockResolvedValue({ exitCode, stdout, stderr });
}

function makeFs(overrides: Partial<FinishFs> = {}): FinishFs {
  return {
    exists: vi.fn().mockResolvedValue(true),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeNestedSpecsFs(specNames: string[]): FinishFs {
  return {
    exists: vi.fn().mockImplementation((path: string) => {
      // Change folder exists
      if (path.includes(changeFolderPath("my-feature"))) return Promise.resolve(true);
      // Nested spec.md files exist
      for (const name of specNames) {
        if (path.endsWith(`/${name}/spec.md`)) return Promise.resolve(true);
      }
      return Promise.resolve(false);
    }),
    readdir: vi.fn().mockImplementation((path: string) => {
      if (path.endsWith("/specs")) return Promise.resolve(specNames);
      return Promise.resolve([]);
    }),
    stat: vi.fn().mockImplementation((path: string) => {
      // All spec names are directories
      for (const name of specNames) {
        if (path.endsWith(`/${name}`)) {
          return Promise.resolve({ isDirectory: () => true });
        }
      }
      return Promise.resolve({ isDirectory: () => false });
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFlatSpecsFs(fileNames: string[]): FinishFs {
  return {
    exists: vi.fn().mockImplementation((path: string) => {
      // Change folder exists
      if (path.includes(changeFolderPath("my-feature"))) return Promise.resolve(true);
      return Promise.resolve(false);
    }),
    readdir: vi.fn().mockImplementation((path: string) => {
      if (path.endsWith("/specs")) return Promise.resolve(fileNames);
      return Promise.resolve([]);
    }),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  };
}

const BASE = {
  slug: "my-feature",
  cwd: "/repo",
};

// TC-024
describe("TC-024: specs/ has nested/flat .md files → openspec archive <slug>", () => {
  it("calls openspec archive without --skip-specs when specs/ has nested spec.md files", async () => {
    const spawn = makeSpawn(0);
    const fs = makeNestedSpecsFs(["cli-finish-command", "job-state-store"]);

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

// TC-024b
describe("TC-024b: nested specs/<name>/spec.md → openspec archive without --skip-specs", () => {
  it("calls openspec archive without --skip-specs for single nested spec", async () => {
    const spawn = makeSpawn(0);
    const fs = makeNestedSpecsFs(["single-spec"]);

    const result = await archiveOpenspec({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);

    const callArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[0]).toBe("openspec");
    expect(callArgs[1]).toEqual(["archive", "my-feature", "--yes"]);
  });
});

// TC-024c
describe("TC-024c: flat specs/*.md → openspec archive without --skip-specs (fallback)", () => {
  it("calls openspec archive without --skip-specs for flat .md files", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFlatSpecsFs(["delta.md", "base.md"]);

    const result = await archiveOpenspec({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(false);

    const callArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[0]).toBe("openspec");
    expect(callArgs[1]).toEqual(["archive", "my-feature", "--yes"]);
  });
});

// TC-025
describe("TC-025: specs/ empty → openspec archive <slug> --skip-specs", () => {
  it("calls openspec archive with --skip-specs when specs/ has no md files", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockResolvedValue(true),
      readdir: vi.fn().mockResolvedValue(["README.txt"]), // no .md files
      stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
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

// TC-025b
describe("TC-025b: directory without spec.md → openspec archive with --skip-specs", () => {
  it("calls openspec archive with --skip-specs when directory has no spec.md", async () => {
    const spawn = makeSpawn(0);
    const fs = makeFs({
      exists: vi.fn().mockImplementation((path: string) => {
        // Change folder exists (but not child paths)
        if (path === `/repo/${changeFolderPath("my-feature")}`) return Promise.resolve(true);
        // spec.md doesn't exist in any directory
        if (path.endsWith("/spec.md")) return Promise.resolve(false);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["some-dir"]),
      stat: vi.fn().mockImplementation((path: string) => {
        // some-dir is a directory
        if (path.endsWith("/some-dir")) {
          return Promise.resolve({ isDirectory: () => true });
        }
        return Promise.resolve({ isDirectory: () => false });
      }),
    });

    const result = await archiveOpenspec({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const callArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[1]).toEqual(["archive", "my-feature", "--yes", "--skip-specs"]);
  });
});

// TC-025c
describe("TC-025c: mixed (1 valid nested + 1 empty dir) → no --skip-specs", () => {
  it("calls openspec archive without --skip-specs when at least one spec exists", async () => {
    const spawn = makeSpawn(0);
    const fs: FinishFs = {
      exists: vi.fn().mockImplementation((path: string) => {
        if (path.includes(changeFolderPath("my-feature"))) return Promise.resolve(true);
        if (path.endsWith("/valid-spec/spec.md")) return Promise.resolve(true);
        if (path.endsWith("/empty-dir/spec.md")) return Promise.resolve(false);
        return Promise.resolve(false);
      }),
      readdir: vi.fn().mockResolvedValue(["valid-spec", "empty-dir"]),
      stat: vi.fn().mockResolvedValue({ isDirectory: () => true }),
      mkdir: vi.fn().mockResolvedValue(undefined),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
    };

    const result = await archiveOpenspec({ ...BASE, spawn, fs });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const callArgs = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(callArgs[1]).toEqual(["archive", "my-feature", "--yes"]); // NO --skip-specs
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
