/**
 * Unit tests for SpecReviewStep.reads() — request.md inclusion.
 *
 * TC-007: spec-review reads() includes request.md
 *
 * NOTE: This test is intentionally RED until src/core/step/spec-review.ts
 * adds { path: requestMdPath(deps.slug) } to the reads() method.
 */
import { describe, it, expect } from "vitest";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import type { JobState } from "../../../src/state/schema.js";
import type { StepDeps } from "../../../src/core/step/types.js";
import { requestMdPath } from "../../../src/util/paths.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMinimalState(): JobState {
  return {
    version: 1,
    jobId: "sr-reads-test-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "spec-change" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "spec-review",
    status: "running",
    branch: "feat/test-slug",
    history: [],
    error: null,
    steps: {},
  };
}

function makeMinimalDeps(slug = "test-slug"): StepDeps {
  return {
    config: {
      version: 1,
      agents: {},
    },
    request: {
      type: "spec-change",
      title: "Test",
      slug,
      baseBranch: "main",
      content: "Do something",
      adr: false,
    },
    slug,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-007: spec-review reads() includes request.md
// ─────────────────────────────────────────────────────────────────────────────

describe("TC-007: SpecReviewStep.reads() includes request.md", () => {
  it("reads() is defined on SpecReviewStep", () => {
    expect(SpecReviewStep.reads).toBeDefined();
  });

  it("reads() includes request.md path for the given slug", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("test-slug");

    const refs = SpecReviewStep.reads!(state, deps);
    const paths = refs.map((r) => r.path);

    const expectedRequestMdPath = requestMdPath("test-slug");
    expect(
      paths,
      `Expected reads() to include "${expectedRequestMdPath}" but got: ${JSON.stringify(paths)}`,
    ).toContain(expectedRequestMdPath);
  });

  it("reads() still includes spec.md (existing inputs preserved)", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("test-slug");

    const refs = SpecReviewStep.reads!(state, deps);
    const paths = refs.map((r) => r.path);

    expect(paths.some((p) => p.endsWith("spec.md"))).toBe(true);
  });

  it("reads() still includes design.md (existing inputs preserved)", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("test-slug");

    const refs = SpecReviewStep.reads!(state, deps);
    const paths = refs.map((r) => r.path);

    expect(paths.some((p) => p.endsWith("design.md"))).toBe(true);
  });

  it("reads() still includes tasks.md (existing inputs preserved)", () => {
    const state = makeMinimalState();
    const deps = makeMinimalDeps("test-slug");

    const refs = SpecReviewStep.reads!(state, deps);
    const paths = refs.map((r) => r.path);

    expect(paths.some((p) => p.endsWith("tasks.md"))).toBe(true);
  });

  it("request.md path is slug-namespaced correctly", () => {
    const slug = "my-feature-slug";
    const state = makeMinimalState();
    const deps = makeMinimalDeps(slug);

    const refs = SpecReviewStep.reads!(state, deps);
    const paths = refs.map((r) => r.path);

    // The path should be specrunner/changes/<slug>/request.md
    expect(paths).toContain(`specrunner/changes/${slug}/request.md`);
    // Should NOT include another slug's request.md
    expect(paths).not.toContain("specrunner/changes/other-slug/request.md");
  });
});
