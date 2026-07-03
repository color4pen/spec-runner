/**
 * Unit tests for src/core/design-layer/check-gate.ts
 *
 * TC-GATE-001: disabled → skipped, spawn not called
 * TC-GATE-002: enabled + exit 0 → passed:true, skipped:false
 * TC-GATE-003: enabled + exit 1 → passed:false, diagnostics in result
 * TC-GATE-004: enabled + exit 2 → passed:false
 * TC-GATE-005: enabled + null exitCode (ENOENT) → passed:false
 * TC-GATE-006: requireCitationTypes includes type → --require-citation added
 * TC-GATE-007: requireCitationTypes excludes type → --require-citation not added
 */
import { describe, it, expect, vi } from "vitest";
import { runDesignLayerCheckGate } from "../../../../src/core/design-layer/check-gate.js";
import type { ResolvedDesignLayer } from "../../../../src/config/schema.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

function makeDesignLayer(overrides: Partial<ResolvedDesignLayer> = {}): ResolvedDesignLayer {
  return {
    enabled: true,
    command: "fake-aozu",
    requireCitationTypes: [],
    ...overrides,
  };
}

function makeSpawn(exitCode: number | null, stderr = ""): SpawnFn {
  return vi.fn().mockResolvedValue({ exitCode, stdout: "", stderr });
}

describe("TC-GATE-001: disabled → skipped, spawn not called", () => {
  it("returns passed:true, skipped:true without calling spawn", async () => {
    const spawn = makeSpawn(0);
    const result = await runDesignLayerCheckGate({
      requestMdPath: "/repo/request.md",
      requestType: "new-feature",
      designLayer: makeDesignLayer({ enabled: false }),
      cwd: "/repo",
      spawn,
    });
    expect(result).toEqual({ passed: true, skipped: true });
    expect(spawn).not.toHaveBeenCalled();
  });

  it("returns skipped when enabled is undefined (default)", async () => {
    const spawn = makeSpawn(0);
    // enabled: false is the resolved default
    const result = await runDesignLayerCheckGate({
      requestMdPath: "/repo/request.md",
      requestType: "new-feature",
      designLayer: { enabled: false, command: "aozu", requireCitationTypes: [] },
      cwd: "/repo",
      spawn,
    });
    expect(result.passed).toBe(true);
    expect((result as { skipped: boolean }).skipped).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe("TC-GATE-002: enabled + exit 0 → passed:true, skipped:false", () => {
  it("returns passed:true when aozu exits 0", async () => {
    const spawn = makeSpawn(0);
    const result = await runDesignLayerCheckGate({
      requestMdPath: "/repo/request.md",
      requestType: "bug-fix",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    expect(result).toEqual({ passed: true, skipped: false });
  });

  it("calls spawn with check --request <path>", async () => {
    const spawn = makeSpawn(0);
    await runDesignLayerCheckGate({
      requestMdPath: "/repo/request.md",
      requestType: "bug-fix",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    expect(spawn).toHaveBeenCalledWith(
      "fake-aozu",
      ["check", "--request", "/repo/request.md"],
      { cwd: "/repo" },
    );
  });
});

describe("TC-GATE-003: enabled + exit 1 → passed:false with diagnostics", () => {
  it("returns passed:false when aozu exits 1", async () => {
    const spawn = makeSpawn(1, "ERROR UNRESOLVED [[mod-foo]] not found\n");
    const stderrWrite = vi.fn();
    const result = await runDesignLayerCheckGate({
      requestMdPath: "/repo/request.md",
      requestType: "new-feature",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
      stderrWrite,
    });
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.exitCode).toBe(1);
      expect(result.diagnostics).toContain("UNRESOLVED");
    }
  });

  it("forwards stderr to stderrWrite", async () => {
    const stderrWrite = vi.fn();
    const spawn = makeSpawn(1, "ERROR UNRESOLVED [[mod-foo]] not found\n");
    await runDesignLayerCheckGate({
      requestMdPath: "/repo/request.md",
      requestType: "new-feature",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
      stderrWrite,
    });
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining("UNRESOLVED"));
  });
});

describe("TC-GATE-004: enabled + exit 2 → passed:false", () => {
  it("returns passed:false when aozu exits 2 (input error)", async () => {
    const spawn = makeSpawn(2, "ERROR: file not found\n");
    const result = await runDesignLayerCheckGate({
      requestMdPath: "/repo/nonexistent.md",
      requestType: "new-feature",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.exitCode).toBe(2);
    }
  });
});

describe("TC-GATE-005: enabled + null exitCode (ENOENT) → passed:false", () => {
  it("returns passed:false when spawn returns null exitCode", async () => {
    const spawn = makeSpawn(null, "spawn ENOENT");
    const result = await runDesignLayerCheckGate({
      requestMdPath: "/repo/request.md",
      requestType: "new-feature",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    expect(result.passed).toBe(false);
    if (!result.passed) {
      expect(result.exitCode).toBeNull();
    }
  });
});

describe("TC-GATE-006: requireCitationTypes includes type → --require-citation added", () => {
  it("adds --require-citation when type is listed", async () => {
    const spawn = makeSpawn(0);
    await runDesignLayerCheckGate({
      requestMdPath: "/repo/request.md",
      requestType: "new-feature",
      designLayer: makeDesignLayer({ requireCitationTypes: ["new-feature", "spec-change"] }),
      cwd: "/repo",
      spawn,
    });
    const [, args] = (spawn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[], unknown];
    expect(args).toContain("--require-citation");
  });
});

describe("TC-GATE-007: requireCitationTypes excludes type → --require-citation not added", () => {
  it("does not add --require-citation when type is not listed", async () => {
    const spawn = makeSpawn(0);
    await runDesignLayerCheckGate({
      requestMdPath: "/repo/request.md",
      requestType: "bug-fix",
      designLayer: makeDesignLayer({ requireCitationTypes: ["new-feature", "spec-change"] }),
      cwd: "/repo",
      spawn,
    });
    const [, args] = (spawn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[], unknown];
    expect(args).not.toContain("--require-citation");
  });
});
