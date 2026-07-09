/**
 * Tests for src/core/step/main-checkout-guard.ts
 *
 * Covers:
 *   TC-012: resolveMonitoredGuardGlobs returns forbiddenSurfaces paths + .specrunner/** dedupe
 *   TC-013: diffGuardSnapshots — "created" kind
 *   TC-014: diffGuardSnapshots — "modified" kind (hash diff)
 *   TC-015: diffGuardSnapshots — "deleted" kind
 *   TC-016: diffGuardSnapshots — no change returns drifted: false
 *   TC-002: already-dirty file with further changes detected via content hash diff
 *   TC-021: ManagedRuntime.snapshotMainCheckoutGuard always returns null
 *   TC-022: mainCheckoutDrift absent in legacy state passes validation
 */

import { describe, it, expect } from "vitest";
import {
  resolveMonitoredGuardGlobs,
  matchesMonitored,
  diffGuardSnapshots,
} from "../main-checkout-guard.js";
import type { MainCheckoutGuardSnapshot } from "../../port/runtime-strategy.js";
import type { SpecRunnerConfig } from "../../../config/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(forbiddenSurfacePaths: string[][] = []): SpecRunnerConfig {
  const forbiddenSurfaces = forbiddenSurfacePaths.map((paths, i) => ({
    id: `surface-${i}`,
    paths,
  }));
  return {
    version: 1,
    pipeline: {
      fast: {
        forbiddenSurfaces: forbiddenSurfaces.length > 0 ? forbiddenSurfaces : undefined,
      },
    },
  } as unknown as SpecRunnerConfig;
}

function makeSnapshot(entries: { path: string; hash: string | null }[]): MainCheckoutGuardSnapshot {
  return { entries };
}

// ---------------------------------------------------------------------------
// TC-012: resolveMonitoredGuardGlobs
// ---------------------------------------------------------------------------

describe("resolveMonitoredGuardGlobs", () => {
  it("TC-012: returns forbiddenSurfaces paths + .specrunner/** deduplicated", () => {
    const config = makeConfig([
      [".specrunner/config.json", "src/core/port/**"],
      ["src/state/schema.ts"],
    ]);
    const globs = resolveMonitoredGuardGlobs(config);
    expect(globs).toContain(".specrunner/config.json");
    expect(globs).toContain("src/core/port/**");
    expect(globs).toContain("src/state/schema.ts");
    expect(globs).toContain(".specrunner/**");
    // .specrunner/** should appear exactly once (dedupe)
    expect(globs.filter((g) => g === ".specrunner/**")).toHaveLength(1);
  });

  it("TC-012: deduplicates paths that appear in multiple surfaces", () => {
    const config = makeConfig([
      ["src/core/port/**", "src/state/schema.ts"],
      ["src/core/port/**"],
    ]);
    const globs = resolveMonitoredGuardGlobs(config);
    expect(globs.filter((g) => g === "src/core/port/**")).toHaveLength(1);
  });

  it("returns only .specrunner/** when no forbiddenSurfaces declared", () => {
    const config = makeConfig([]);
    const globs = resolveMonitoredGuardGlobs(config);
    expect(globs).toEqual([".specrunner/**"]);
  });

  it("pipeline-profile independent: uses literal 'fast', does not return [] for standard", () => {
    const config = makeConfig([["src/core/port/**"]]);
    const globs = resolveMonitoredGuardGlobs(config);
    // Should always include the forbidden surface paths
    expect(globs).toContain("src/core/port/**");
  });
});

// ---------------------------------------------------------------------------
// matchesMonitored
// ---------------------------------------------------------------------------

describe("matchesMonitored", () => {
  it("returns true for a path matching a glob", () => {
    expect(matchesMonitored(".specrunner/config.json", [".specrunner/**"])).toBe(true);
  });

  it("returns false when no glob matches", () => {
    expect(matchesMonitored("specrunner/drafts/foo.md", [".specrunner/**", "src/state/**"])).toBe(false);
  });

  it("returns true when any glob matches", () => {
    expect(matchesMonitored("src/state/schema.ts", ["src/core/port/**", "src/state/**"])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-013: diffGuardSnapshots — "created"
// ---------------------------------------------------------------------------

describe("diffGuardSnapshots — created", () => {
  it("TC-013: path only in after → kind: created", () => {
    const before = makeSnapshot([]);
    const after = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:abc" }]);
    const result = diffGuardSnapshots(before, after);
    expect(result.drifted).toBe(true);
    expect(result.changes).toEqual([{ path: ".specrunner/config.json", kind: "created" }]);
  });
});

// ---------------------------------------------------------------------------
// TC-014: diffGuardSnapshots — "modified" (hash diff)
// ---------------------------------------------------------------------------

describe("diffGuardSnapshots — modified (hash diff)", () => {
  it("TC-014: same path in both, different hashes → kind: modified", () => {
    const before = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:aaa" }]);
    const after = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:bbb" }]);
    const result = diffGuardSnapshots(before, after);
    expect(result.drifted).toBe(true);
    expect(result.changes).toEqual([{ path: ".specrunner/config.json", kind: "modified" }]);
  });

  it("path only in before (went back to clean) → kind: modified", () => {
    const before = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:aaa" }]);
    const after = makeSnapshot([]);
    const result = diffGuardSnapshots(before, after);
    expect(result.drifted).toBe(true);
    expect(result.changes).toEqual([{ path: ".specrunner/config.json", kind: "modified" }]);
  });

  it("TC-002: already-dirty file further modified — hash diff detected", () => {
    // Both snapshots contain the same path (file was dirty in both before and after),
    // but the content changed between before and after.
    const before = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:dirty-before" }]);
    const after = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:dirty-after" }]);
    const result = diffGuardSnapshots(before, after);
    expect(result.drifted).toBe(true);
    expect(result.changes).toEqual([{ path: ".specrunner/config.json", kind: "modified" }]);
  });
});

// ---------------------------------------------------------------------------
// TC-015: diffGuardSnapshots — "deleted"
// ---------------------------------------------------------------------------

describe("diffGuardSnapshots — deleted", () => {
  it("TC-015: after hash is null (DELETED), before was non-null → kind: deleted", () => {
    const before = makeSnapshot([{ path: ".specrunner/config.json", hash: "sha256:abc" }]);
    const after = makeSnapshot([{ path: ".specrunner/config.json", hash: null }]);
    const result = diffGuardSnapshots(before, after);
    expect(result.drifted).toBe(true);
    expect(result.changes).toEqual([{ path: ".specrunner/config.json", kind: "deleted" }]);
  });
});

// ---------------------------------------------------------------------------
// TC-016: diffGuardSnapshots — no change
// ---------------------------------------------------------------------------

describe("diffGuardSnapshots — no change", () => {
  it("TC-016: same entries in both → drifted: false, changes: []", () => {
    const before = makeSnapshot([
      { path: ".specrunner/config.json", hash: "sha256:abc" },
      { path: "src/state/schema.ts", hash: "sha256:def" },
    ]);
    const after = makeSnapshot([
      { path: ".specrunner/config.json", hash: "sha256:abc" },
      { path: "src/state/schema.ts", hash: "sha256:def" },
    ]);
    const result = diffGuardSnapshots(before, after);
    expect(result.drifted).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it("both snapshots empty → drifted: false", () => {
    const result = diffGuardSnapshots(makeSnapshot([]), makeSnapshot([]));
    expect(result.drifted).toBe(false);
    expect(result.changes).toEqual([]);
  });

  it("both have same null hash (both deleted) → no drift", () => {
    const before = makeSnapshot([{ path: ".specrunner/config.json", hash: null }]);
    const after = makeSnapshot([{ path: ".specrunner/config.json", hash: null }]);
    const result = diffGuardSnapshots(before, after);
    expect(result.drifted).toBe(false);
    expect(result.changes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Determinism: changes sorted by path
// ---------------------------------------------------------------------------

describe("diffGuardSnapshots — deterministic sort", () => {
  it("changes are returned sorted by path (ascending)", () => {
    const before = makeSnapshot([]);
    const after = makeSnapshot([
      { path: "z-path", hash: "sha256:z" },
      { path: "a-path", hash: "sha256:a" },
      { path: "m-path", hash: "sha256:m" },
    ]);
    const result = diffGuardSnapshots(before, after);
    expect(result.drifted).toBe(true);
    expect(result.changes.map((c) => c.path)).toEqual(["a-path", "m-path", "z-path"]);
  });
});

// ---------------------------------------------------------------------------
// TC-021: ManagedRuntime.snapshotMainCheckoutGuard always returns null
// ---------------------------------------------------------------------------

describe("TC-021: ManagedRuntime.snapshotMainCheckoutGuard", () => {
  it("always returns null without throwing", async () => {
    const { ManagedRuntime } = await import("../../runtime/managed.js");
    const runtime = new ManagedRuntime(
      "/tmp/cwd",
      {} as never,
      {} as never,
      { owner: "o", name: "r" },
      undefined,
      "fake-token",
    );
    const result = await runtime.snapshotMainCheckoutGuard("/tmp/cwd", {} as SpecRunnerConfig);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-022: mainCheckoutDrift absent in legacy state passes validation
// ---------------------------------------------------------------------------

describe("TC-022: mainCheckoutDrift backward compat", () => {
  it("legacy state without mainCheckoutDrift validates successfully", async () => {
    const { validateJobState } = await import("../../../state/schema.js");
    const legacyState = {
      version: 2,
      jobId: "test-job-001",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "specrunner/changes/x/request.md", title: "X", type: "bug-fix" },
      repository: { owner: "o", name: "r" },
      session: null,
      step: "implementer",
      status: "running",
      branch: null,
      history: [],
      error: null,
      // no mainCheckoutDrift field
    };
    expect(() => validateJobState(legacyState)).not.toThrow();
  });

  it("state with mainCheckoutDrift validates successfully", async () => {
    const { validateJobState } = await import("../../../state/schema.js");
    const state = {
      version: 2,
      jobId: "test-job-002",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "specrunner/changes/x/request.md", title: "X", type: "bug-fix" },
      repository: { owner: "o", name: "r" },
      session: null,
      step: "implementer",
      status: "awaiting-resume",
      branch: null,
      history: [],
      error: null,
      mainCheckoutDrift: {
        changes: [{ path: ".specrunner/config.json", kind: "modified" }],
        detectedAtStep: "implementer",
        ts: "2026-01-01T00:01:00.000Z",
      },
    };
    expect(() => validateJobState(state)).not.toThrow();
  });

  it("state with mainCheckoutDrift: null validates successfully", async () => {
    const { validateJobState } = await import("../../../state/schema.js");
    const state = {
      version: 2,
      jobId: "test-job-003",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "specrunner/changes/x/request.md", title: "X", type: "bug-fix" },
      repository: { owner: "o", name: "r" },
      session: null,
      step: "implementer",
      status: "running",
      branch: null,
      history: [],
      error: null,
      mainCheckoutDrift: null,
    };
    expect(() => validateJobState(state)).not.toThrow();
  });
});
