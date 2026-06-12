/**
 * Tests for baseBranch field on RequestInfo.
 *
 * TC-BB-001: baseBranch persisted and loaded via validateJobState round-trip
 * TC-BB-002: legacy state without baseBranch passes validateJobState
 * TC-BB-003: buildInitialJobState spreads baseBranch from request param
 */
import { describe, it, expect } from "vitest";
import { validateJobState } from "../../../src/state/schema.js";
import { buildInitialJobState } from "../../../src/store/job-state-store.js";

// ---------------------------------------------------------------------------
// TC-BB-001: baseBranch round-trip through validateJobState
// ---------------------------------------------------------------------------

describe("TC-BB-001: baseBranch is preserved through validateJobState", () => {
  it("retains baseBranch=develop after validation", () => {
    const raw = {
      version: 2,
      jobId: "test-job-id-0001",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: {
        path: "/repo/specrunner/changes/my-slug/request.md",
        title: "Test",
        type: "new-feature",
        slug: "my-slug",
        baseBranch: "develop",
      },
      repository: { owner: "owner", name: "repo" },
      session: null,
      step: "design",
      status: "running",
      branch: "feat/my-slug-abcdef01",
      history: [],
      error: null,
      steps: {},
    };

    const state = validateJobState(raw);

    expect(state.request.baseBranch).toBe("develop");
  });

  it("retains baseBranch=main after validation", () => {
    const raw = {
      version: 2,
      jobId: "test-job-id-0002",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: {
        path: "/repo/specrunner/changes/my-slug/request.md",
        title: "Test",
        type: "new-feature",
        slug: "my-slug",
        baseBranch: "main",
      },
      repository: { owner: "owner", name: "repo" },
      session: null,
      step: "design",
      status: "running",
      branch: "feat/my-slug-abcdef01",
      history: [],
      error: null,
      steps: {},
    };

    const state = validateJobState(raw);

    expect(state.request.baseBranch).toBe("main");
  });
});

// ---------------------------------------------------------------------------
// TC-BB-002: legacy state without baseBranch passes validateJobState
// ---------------------------------------------------------------------------

describe("TC-BB-002: legacy state without baseBranch passes validateJobState", () => {
  it("does not throw when baseBranch is absent", () => {
    const raw = {
      version: 2,
      jobId: "test-job-id-0003",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: {
        path: "/repo/specrunner/changes/my-slug/request.md",
        title: "Test",
        type: "new-feature",
        slug: "my-slug",
        // no baseBranch field
      },
      repository: { owner: "owner", name: "repo" },
      session: null,
      step: "design",
      status: "running",
      branch: "feat/my-slug-abcdef01",
      history: [],
      error: null,
      steps: {},
    };

    expect(() => validateJobState(raw)).not.toThrow();
    const state = validateJobState(raw);
    expect(state.request.baseBranch).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-BB-003: buildInitialJobState spreads baseBranch from request param
// ---------------------------------------------------------------------------

describe("TC-BB-003: buildInitialJobState propagates baseBranch from request param", () => {
  it("includes baseBranch in built state when provided", () => {
    const state = buildInitialJobState({
      request: {
        path: "/repo/specrunner/changes/my-slug/request.md",
        title: "Test",
        type: "new-feature",
        slug: "my-slug",
        baseBranch: "develop",
      },
      repository: { owner: "owner", name: "repo" },
    });

    expect(state.request.baseBranch).toBe("develop");
  });

  it("baseBranch is undefined in built state when not provided (legacy)", () => {
    const state = buildInitialJobState({
      request: {
        path: "/repo/specrunner/changes/my-slug/request.md",
        title: "Test",
        type: "new-feature",
        slug: "my-slug",
      },
      repository: { owner: "owner", name: "repo" },
    });

    expect(state.request.baseBranch).toBeUndefined();
  });
});
