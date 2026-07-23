/**
 * Tests for canon-write-scope.ts (buildCanonWriteScope factory).
 *
 * TC-017: buildCanonWriteScope の code-fixer writable は空集合
 * TC-018: buildCanonWriteScope の implementer writable は {tasks.md}
 * TC-019: buildCanonWriteScope の spec-fixer writable は {spec.md, design.md}
 * TC-029: drift-guard — writableByFixer が各 fixer の writes() ∩ protectedCanonPaths と一致
 *
 * RED: implementation (src/core/step/canon-write-scope.ts) does not exist yet.
 */
import { describe, it, expect } from "vitest";
import { buildCanonWriteScope } from "../../../../src/core/step/canon-write-scope.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { StepDeps } from "../../../../src/core/port/step-types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = "test-slug";

/** Minimal JobState sufficient for buildCanonWriteScope. */
function makeState(slug = SLUG): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: {
      path: `specrunner/changes/${slug}/request.md`,
      title: "Test",
      type: "bug-fix",
      slug,
    },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "conformance",
    status: "running",
    branch: `feat/${slug}`,
    history: [],
    error: null,
    steps: {},
  };
}

/** Minimal StepDeps sufficient for buildCanonWriteScope. */
function makeDeps(slug = SLUG): StepDeps {
  return {
    slug,
    config: { version: 1, runtime: "managed", agents: {} } as StepDeps["config"],
    request: {
      type: "bug-fix",
      title: "Test",
      slug,
      baseBranch: "main",
      content: "# Test",
      adr: false,
      path: `specrunner/changes/${slug}/request.md`,
    },
  } as StepDeps;
}

// ---------------------------------------------------------------------------
// TC-017: code-fixer writable は空集合
// ---------------------------------------------------------------------------

describe("TC-017: buildCanonWriteScope — code-fixer writable は空集合", () => {
  it("writableByFixer.get('code-fixer') は空集合", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const codeFixer = scope.writableByFixer.get("code-fixer");

    // code-fixer の宣言 write に正典ファイルは含まれない
    expect(codeFixer).toBeDefined();
    expect(codeFixer!.size).toBe(0);
  });

  it("code-fixer は test-cases.md を書けない", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const codeFixer = scope.writableByFixer.get("code-fixer") ?? new Set();

    expect(codeFixer.has(`specrunner/changes/${SLUG}/test-cases.md`)).toBe(false);
  });

  it("code-fixer は request.md を書けない", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const codeFixer = scope.writableByFixer.get("code-fixer") ?? new Set();

    expect(codeFixer.has(`specrunner/changes/${SLUG}/request.md`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-018: implementer writable は {tasks.md} のみ
// ---------------------------------------------------------------------------

describe("TC-018: buildCanonWriteScope — implementer writable は {tasks.md}", () => {
  it("writableByFixer.get('implementer') は tasks.md を含む", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const implementer = scope.writableByFixer.get("implementer") ?? new Set();

    expect(implementer.has(`specrunner/changes/${SLUG}/tasks.md`)).toBe(true);
  });

  it("implementer writable には tasks.md のみ含まれる（spec.md / design.md / request.md / test-cases.md は含まれない）", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const implementer = scope.writableByFixer.get("implementer") ?? new Set();

    expect(implementer.has(`specrunner/changes/${SLUG}/spec.md`)).toBe(false);
    expect(implementer.has(`specrunner/changes/${SLUG}/design.md`)).toBe(false);
    expect(implementer.has(`specrunner/changes/${SLUG}/request.md`)).toBe(false);
    expect(implementer.has(`specrunner/changes/${SLUG}/test-cases.md`)).toBe(false);
  });

  it("slug が異なれば実際の tasks.md パスも異なる", () => {
    const slug2 = "other-slug";
    const state = makeState(slug2);
    const deps = makeDeps(slug2);

    const scope = buildCanonWriteScope(state, deps);
    const implementer = scope.writableByFixer.get("implementer") ?? new Set();

    expect(implementer.has(`specrunner/changes/${slug2}/tasks.md`)).toBe(true);
    expect(implementer.has(`specrunner/changes/${SLUG}/tasks.md`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-019: spec-fixer writable は {spec.md, design.md, tasks.md}
// ---------------------------------------------------------------------------

describe("TC-019: buildCanonWriteScope — spec-fixer writable は {spec.md, design.md, tasks.md}", () => {
  it("writableByFixer.get('spec-fixer') は spec.md を含む", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();

    expect(specFixer.has(`specrunner/changes/${SLUG}/spec.md`)).toBe(true);
  });

  it("writableByFixer.get('spec-fixer') は design.md を含む", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();

    expect(specFixer.has(`specrunner/changes/${SLUG}/design.md`)).toBe(true);
  });

  it("writableByFixer.get('spec-fixer') は tasks.md を含む", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();

    expect(specFixer.has(`specrunner/changes/${SLUG}/tasks.md`)).toBe(true);
  });

  it("spec-fixer writable に request.md / test-cases.md は含まれない", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();

    expect(specFixer.has(`specrunner/changes/${SLUG}/request.md`)).toBe(false);
    expect(specFixer.has(`specrunner/changes/${SLUG}/test-cases.md`)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canonPaths の検証
// ---------------------------------------------------------------------------

describe("buildCanonWriteScope — canonPaths はすべての保護正典を含む", () => {
  it("canonPaths は test-cases.md を含む", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);

    expect(scope.canonPaths.has(`specrunner/changes/${SLUG}/test-cases.md`)).toBe(true);
  });

  it("canonPaths は request.md を含む", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);

    expect(scope.canonPaths.has(`specrunner/changes/${SLUG}/request.md`)).toBe(true);
  });

  it("canonPaths は spec.md / design.md / tasks.md を含む", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);

    expect(scope.canonPaths.has(`specrunner/changes/${SLUG}/spec.md`)).toBe(true);
    expect(scope.canonPaths.has(`specrunner/changes/${SLUG}/design.md`)).toBe(true);
    expect(scope.canonPaths.has(`specrunner/changes/${SLUG}/tasks.md`)).toBe(true);
  });

  it("src/** は canonPaths に含まれない", () => {
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);

    expect(scope.canonPaths.has("src/core/foo.ts")).toBe(false);
    expect(scope.canonPaths.has("src/util/paths.ts")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-029 (could): drift-guard — writableByFixer が各 fixer の writes() ∩ protectedCanonPaths と一致
//
// D5 の明示 map fallback を採用した場合、`buildCanonWriteScope` の writableByFixer は
// 各 fixer の `writes(state, deps)` の結果と照合して一致する必要がある。
// このテストは map と writes() の乖離を検出するための drift-guard である。
// ---------------------------------------------------------------------------

describe("TC-029 (could): drift-guard — writableByFixer が writes() ∩ protectedCanonPaths と一致", () => {
  it("code-fixer: writes() ∩ canonPaths = ∅（gitState のみ、非 canon file なし）", async () => {
    const { CodeFixerStep } = await import("../../../../src/core/step/code-fixer.js");
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const codeFixer = scope.writableByFixer.get("code-fixer") ?? new Set();

    // code-fixer.writes() returns only {gitState artifact}
    // artifact:gitState paths are excluded from writableByFixer computation
    const codeFixerWrites = (CodeFixerStep.writes ? CodeFixerStep.writes(state, deps) : [])
      .filter((ref) => ref.artifact !== "gitState")
      .map((ref) => ref.path);
    const actualCanonIntersection = codeFixerWrites.filter((p) => scope.canonPaths.has(p));

    // Drift-guard: explicit map must match actual writes() ∩ canon
    expect(codeFixer.size).toBe(actualCanonIntersection.length);
    for (const p of actualCanonIntersection) {
      expect(codeFixer.has(p)).toBe(true);
    }
  });

  it("implementer: writes() ∩ canonPaths = {tasks.md}（single source of truth）", async () => {
    const { ImplementerStep } = await import("../../../../src/core/step/implementer.js");
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const implementer = scope.writableByFixer.get("implementer") ?? new Set();

    const implementerWrites = (ImplementerStep.writes ? ImplementerStep.writes(state, deps) : [])
      .filter((ref) => ref.artifact !== "gitState")
      .map((ref) => ref.path);
    const actualCanonIntersection = implementerWrites.filter((p) => scope.canonPaths.has(p));

    // Drift-guard: explicit map must match actual writes() ∩ canon
    expect(implementer.size).toBe(actualCanonIntersection.length);
    for (const p of actualCanonIntersection) {
      expect(implementer.has(p)).toBe(true);
    }
  });

  it("spec-fixer: writes() ∩ canonPaths = {spec.md, design.md, tasks.md}（single source of truth）", async () => {
    const { SpecFixerStep } = await import("../../../../src/core/step/spec-fixer.js");
    const state = makeState();
    const deps = makeDeps();

    const scope = buildCanonWriteScope(state, deps);
    const specFixer = scope.writableByFixer.get("spec-fixer") ?? new Set();

    const specFixerWrites = (SpecFixerStep.writes ? SpecFixerStep.writes(state, deps) : [])
      .filter((ref) => ref.artifact !== "gitState")
      .map((ref) => ref.path);
    const actualCanonIntersection = specFixerWrites.filter((p) => scope.canonPaths.has(p));

    // Drift-guard: explicit map must match actual writes() ∩ canon
    expect(specFixer.size).toBe(actualCanonIntersection.length);
    for (const p of actualCanonIntersection) {
      expect(specFixer.has(p)).toBe(true);
    }
  });
});
