/**
 * Unit tests for src/core/pipeline/scope.ts
 *
 * Covers T-03:
 * - deriveScopeBreach: scope absent / forbidden empty → breached=false
 * - deriveScopeBreach: changed-file matches forbidden surface → breached=true, surfaces sorted
 * - deriveScopeBreach: no match → breached=false
 * - synthesizeScopeFindings: determinism (same input → same output)
 * - synthesizeScopeFindings: origin="scope", resolution="decision-needed", ≥2 options
 * - synthesizeScopeFindings: breach.breached=false → []
 */
import { describe, it, expect } from "vitest";
import {
  deriveScopeBreach,
  synthesizeScopeFindings,
} from "../../../../src/core/pipeline/scope.js";
import type { DeriveScopeBreachInput, SynthesisContext } from "../../../../src/core/pipeline/scope.js";
import type { PermissionScope } from "../../../../src/core/pipeline/types.js";
import type { JobState } from "../../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMinimalState(): JobState {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix", slug: "my-slug" },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
  };
}

function makeInput(overrides: Partial<DeriveScopeBreachInput> = {}): DeriveScopeBreachInput {
  return {
    scope: undefined,
    changedFiles: [],
    state: makeMinimalState(),
    ...overrides,
  };
}

const srcScope: PermissionScope = {
  checkpoint: "spec-review",
  forbidden: [
    { id: "src-auth", paths: ["src/auth/**"] },
    { id: "src-core", paths: ["src/core/**"] },
  ],
};

// ---------------------------------------------------------------------------
// deriveScopeBreach — scope absent
// ---------------------------------------------------------------------------

describe("deriveScopeBreach — scope absent", () => {
  it("returns breached=false when scope is undefined", () => {
    const result = deriveScopeBreach(makeInput({ scope: undefined }));
    expect(result.breached).toBe(false);
    expect(result.surfaces).toEqual([]);
  });

  it("returns breached=false when forbidden is empty", () => {
    const scope: PermissionScope = { checkpoint: "spec-review", forbidden: [] };
    const result = deriveScopeBreach(makeInput({
      scope,
      changedFiles: ["src/auth/login.ts"],
    }));
    expect(result.breached).toBe(false);
    expect(result.surfaces).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deriveScopeBreach — no match
// ---------------------------------------------------------------------------

describe("deriveScopeBreach — no match", () => {
  it("returns breached=false when no changed file matches any forbidden surface", () => {
    const result = deriveScopeBreach(makeInput({
      scope: srcScope,
      changedFiles: ["specrunner/changes/my-slug/request.md", "tests/foo.test.ts"],
    }));
    expect(result.breached).toBe(false);
    expect(result.surfaces).toEqual([]);
  });

  it("returns breached=false when changedFiles is empty", () => {
    const result = deriveScopeBreach(makeInput({
      scope: srcScope,
      changedFiles: [],
    }));
    expect(result.breached).toBe(false);
    expect(result.surfaces).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deriveScopeBreach — breach detected
// ---------------------------------------------------------------------------

describe("deriveScopeBreach — breach detected", () => {
  it("returns breached=true when a changed file matches a forbidden surface", () => {
    const result = deriveScopeBreach(makeInput({
      scope: srcScope,
      changedFiles: ["src/auth/login.ts", "tests/auth.test.ts"],
    }));
    expect(result.breached).toBe(true);
    expect(result.surfaces).toEqual(["src-auth"]);
  });

  it("returns all breached surface ids sorted", () => {
    const result = deriveScopeBreach(makeInput({
      scope: srcScope,
      changedFiles: ["src/core/pipeline/types.ts", "src/auth/session.ts"],
    }));
    expect(result.breached).toBe(true);
    // Both surfaces breached: src-auth and src-core — sorted alphabetically
    expect(result.surfaces).toEqual(["src-auth", "src-core"]);
  });

  it("deduplicates surface ids when multiple files match the same surface", () => {
    const result = deriveScopeBreach(makeInput({
      scope: srcScope,
      changedFiles: ["src/auth/login.ts", "src/auth/logout.ts"],
    }));
    expect(result.breached).toBe(true);
    expect(result.surfaces).toEqual(["src-auth"]);
  });

  it("glob ** matches nested paths", () => {
    const scope: PermissionScope = {
      checkpoint: "conformance",
      forbidden: [{ id: "deep-src", paths: ["src/**/*.ts"] }],
    };
    const result = deriveScopeBreach(makeInput({
      scope,
      changedFiles: ["src/core/pipeline/types.ts"],
    }));
    expect(result.breached).toBe(true);
    expect(result.surfaces).toEqual(["deep-src"]);
  });

  it("surface with multiple glob patterns — any match counts", () => {
    const scope: PermissionScope = {
      checkpoint: "spec-review",
      forbidden: [{ id: "multi", paths: ["src/auth/**", "src/core/**"] }],
    };
    // Only auth file changed, should match the first pattern
    const result = deriveScopeBreach(makeInput({
      scope,
      changedFiles: ["src/auth/utils.ts"],
    }));
    expect(result.breached).toBe(true);
    expect(result.surfaces).toEqual(["multi"]);
  });
});

// ---------------------------------------------------------------------------
// synthesizeScopeFindings — breach.breached=false → []
// ---------------------------------------------------------------------------

describe("synthesizeScopeFindings — not breached", () => {
  const ctx: SynthesisContext = { slug: "my-feature" };

  it("returns empty array when breach.breached=false", () => {
    const result = synthesizeScopeFindings({ breached: false, surfaces: [] }, ctx);
    expect(result).toHaveLength(0);
  });

  it("returns empty array when surfaces is empty even if breached=true (defensive)", () => {
    const result = synthesizeScopeFindings({ breached: true, surfaces: [] }, ctx);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// synthesizeScopeFindings — determinism
// ---------------------------------------------------------------------------

describe("synthesizeScopeFindings — determinism", () => {
  const ctx: SynthesisContext = { slug: "my-feature" };
  const breach = { breached: true, surfaces: ["src-auth", "src-core"] };

  it("produces exactly 1 finding", () => {
    const result = synthesizeScopeFindings(breach, ctx);
    expect(result).toHaveLength(1);
  });

  it("same input → identical output (file, title, rationale, options)", () => {
    const r1 = synthesizeScopeFindings(breach, ctx);
    const r2 = synthesizeScopeFindings(breach, ctx);
    expect(r1).toEqual(r2);
  });

  it("file anchor is deterministic and includes slug", () => {
    const result = synthesizeScopeFindings(breach, ctx);
    expect(result[0]!.file).toBe("specrunner/changes/my-feature/request.md");
  });

  it("title is fixed deterministic text", () => {
    const result = synthesizeScopeFindings(breach, ctx);
    expect(result[0]!.title).toBe("Scope exceeded: changes touch forbidden surfaces");
  });

  it("rationale includes all breached surface ids", () => {
    const result = synthesizeScopeFindings(breach, ctx);
    const rationale = result[0]!.rationale;
    expect(rationale).toContain("src-auth");
    expect(rationale).toContain("src-core");
  });
});

// ---------------------------------------------------------------------------
// synthesizeScopeFindings — origin, resolution, severity, options
// ---------------------------------------------------------------------------

describe("synthesizeScopeFindings — finding shape", () => {
  const ctx: SynthesisContext = { slug: "my-slug" };
  const breach = { breached: true, surfaces: ["src-auth"] };

  it("origin is 'scope'", () => {
    const [f] = synthesizeScopeFindings(breach, ctx);
    expect(f!.origin).toBe("scope");
  });

  it("resolution is 'decision-needed'", () => {
    const [f] = synthesizeScopeFindings(breach, ctx);
    expect(f!.resolution).toBe("decision-needed");
  });

  it("severity is 'high'", () => {
    const [f] = synthesizeScopeFindings(breach, ctx);
    expect(f!.severity).toBe("high");
  });

  it("options has at least 2 entries (decision-needed contract)", () => {
    const [f] = synthesizeScopeFindings(breach, ctx);
    expect(f!.options).toBeDefined();
    expect(f!.options!.length).toBeGreaterThanOrEqual(2);
  });

  it("each option has non-empty label and consequence", () => {
    const [f] = synthesizeScopeFindings(breach, ctx);
    for (const opt of f!.options!) {
      expect(opt.label.trim().length).toBeGreaterThan(0);
      expect(opt.consequence.trim().length).toBeGreaterThan(0);
    }
  });
});
