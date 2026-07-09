/**
 * Unit tests for src/core/design-layer/mark-hook.ts
 *
 * TC-HOOK-001: disabled → skipped, spawn not called
 * TC-HOOK-002: enabled + exit 0 → marked, git add -A called
 * TC-HOOK-003: enabled + exit 1 → unknown-slug, warning logged
 * TC-HOOK-004: enabled + exit 2 → error with escalation
 * TC-HOOK-005: null exitCode → error with escalation
 * TC-HOOK-006: prNumber present → --pr added to args
 * TC-HOOK-007: prNumber absent → --pr not added to args
 * TC-HOOK-008: git add -A failure → error with escalation
 */
import { describe, it, expect, vi } from "vitest";
import { runDesignLayerMarkHook } from "../../../../src/core/design-layer/mark-hook.js";
import type { ResolvedDesignLayer } from "../../../../src/config/schema.js";
import type { SpawnFn } from "../../../../src/util/spawn.js";

function makeDesignLayer(overrides: Partial<ResolvedDesignLayer> = {}): ResolvedDesignLayer {
  return {
    enabled: true,
    command: "fake-aozu",
    requireCitationTypes: [],
    topicEmission: true,
    ...overrides,
  };
}

function makeSpawnSeries(responses: Array<{ exitCode: number | null; stdout?: string; stderr?: string }>): SpawnFn {
  let callCount = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[callCount] ?? responses[responses.length - 1]!;
    callCount++;
    return Promise.resolve({ exitCode: resp.exitCode, stdout: resp.stdout ?? "", stderr: resp.stderr ?? "" });
  });
}

describe("TC-HOOK-001: disabled → skipped, spawn not called", () => {
  it("returns status:skipped without calling spawn", async () => {
    const spawn = makeSpawnSeries([{ exitCode: 0 }]);
    const result = await runDesignLayerMarkHook({
      slug: "my-feature",
      designLayer: makeDesignLayer({ enabled: false }),
      cwd: "/repo",
      spawn,
    });
    expect(result).toEqual({ status: "skipped" });
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe("TC-HOOK-002: enabled + exit 0 → marked, git add -A called", () => {
  it("returns status:marked and calls git add -A after exit 0", async () => {
    const spawn = makeSpawnSeries([
      { exitCode: 0 }, // aozu mark implemented
      { exitCode: 0 }, // git add -A -- design
    ]);
    const result = await runDesignLayerMarkHook({
      slug: "my-feature",
      prNumber: 42,
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    expect(result).toEqual({ status: "marked" });
    // First call: aozu mark implemented
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe("fake-aozu");
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toContain("mark");
    // Second call: git add -A -- design (scoped to aozu's design dir)
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls[1]![0]).toBe("git");
    expect((spawn as ReturnType<typeof vi.fn>).mock.calls[1]![1]).toEqual(["add", "-A", "--", "design"]);
  });
});

describe("TC-HOOK-003: enabled + exit 1 → unknown-slug (orchestrator handles warning)", () => {
  it("returns status:unknown-slug without emitting any warning (caller decides)", async () => {
    const spawn = makeSpawnSeries([{ exitCode: 1 }]);
    const result = await runDesignLayerMarkHook({
      slug: "my-feature",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    expect(result).toEqual({ status: "unknown-slug" });
  });
});

describe("TC-HOOK-004: enabled + exit 2 → error with escalation", () => {
  it("returns status:error with escalation string on exit 2", async () => {
    const spawn = makeSpawnSeries([{ exitCode: 2, stderr: "bad input" }]);
    const result = await runDesignLayerMarkHook({
      slug: "my-feature",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.escalation).toContain("mark");
    }
  });
});

describe("TC-HOOK-005: null exitCode → error with escalation", () => {
  it("returns status:error when spawn returns null exitCode (ENOENT)", async () => {
    const spawn = makeSpawnSeries([{ exitCode: null, stderr: "spawn ENOENT" }]);
    const result = await runDesignLayerMarkHook({
      slug: "my-feature",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    expect(result.status).toBe("error");
  });
});

describe("TC-HOOK-006: prNumber present → --pr added to args", () => {
  it("includes --pr <n> in spawn args when prNumber is provided", async () => {
    const spawn = makeSpawnSeries([{ exitCode: 0 }, { exitCode: 0 }]);
    await runDesignLayerMarkHook({
      slug: "my-feature",
      prNumber: 99,
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    const args = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(args).toContain("--pr");
    expect(args).toContain("99");
  });
});

describe("TC-HOOK-007: prNumber absent → --pr not added to args", () => {
  it("does not include --pr in spawn args when prNumber is undefined", async () => {
    const spawn = makeSpawnSeries([{ exitCode: 0 }, { exitCode: 0 }]);
    await runDesignLayerMarkHook({
      slug: "my-feature",
      // prNumber: undefined
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    const args = (spawn as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string[];
    expect(args).not.toContain("--pr");
  });
});

describe("TC-HOOK-008: git add -A failure → error with escalation", () => {
  it("returns status:error when git add -A fails after exit 0", async () => {
    const spawn = makeSpawnSeries([
      { exitCode: 0 },             // aozu mark implemented succeeds
      { exitCode: 1, stderr: "git add failed" }, // git add -A fails
    ]);
    const result = await runDesignLayerMarkHook({
      slug: "my-feature",
      designLayer: makeDesignLayer(),
      cwd: "/repo",
      spawn,
    });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.escalation).toContain("git add");
    }
  });
});
