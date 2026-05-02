/**
 * Unit tests for src/state/job-slug.ts
 *
 * TC-111: getJobSlug — slug field present → slug returned
 * TC-112: getJobSlug — slug null + branch with prefix → stripped branch
 * TC-113: getJobSlug — slug null + empty branch → request.path basename
 * TC-114: getJobSlug — all sources absent → ""
 * TC-115: stripBranchPrefix — all 5 known prefixes
 * TC-116: RequestInfo.slug — canonical path populates slug (run.ts logic)
 * TC-117: RequestInfo.slug — non-canonical path leaves slug null (run.ts logic)
 * TC-118: legacy state file (no slug field) → load succeeds, slug=null, getJobSlug works
 */
import { describe, it, expect } from "vitest";
import { getJobSlug, stripBranchPrefix } from "../../src/state/job-slug.js";
import { validateJobState } from "../../src/state/schema.js";
import type { JobState } from "../../src/state/schema.js";

function makeMinimalState(overrides: Partial<{
  slug: string | null;
  branch: string | null;
  requestPath: string;
}> = {}): JobState {
  const raw = {
    version: 1,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: {
      path: overrides.requestPath ?? "/req.md",
      title: "Test",
      type: "feature",
      slug: overrides.slug !== undefined ? overrides.slug : null,
    },
    repository: { owner: "user", name: "repo" },
    session: null,
    step: "init",
    status: "running",
    branch: overrides.branch !== undefined ? overrides.branch : null,
    history: [],
    error: null,
  };
  return validateJobState(raw);
}

// TC-115: stripBranchPrefix — 5 known prefixes
describe("TC-115: stripBranchPrefix strips all 5 known prefixes", () => {
  it("strips feat/", () => {
    expect(stripBranchPrefix("feat/foo")).toBe("foo");
  });
  it("strips fix/", () => {
    expect(stripBranchPrefix("fix/foo")).toBe("foo");
  });
  it("strips change/", () => {
    expect(stripBranchPrefix("change/foo")).toBe("foo");
  });
  it("strips refactor/", () => {
    expect(stripBranchPrefix("refactor/foo")).toBe("foo");
  });
  it("strips chore/", () => {
    expect(stripBranchPrefix("chore/foo")).toBe("foo");
  });
  it("returns original when no known prefix", () => {
    expect(stripBranchPrefix("main-something")).toBe("main-something");
  });
  it("strips multi-segment slug: feat/readme-status-section → readme-status-section", () => {
    expect(stripBranchPrefix("feat/readme-status-section")).toBe("readme-status-section");
  });
});

// TC-111: getJobSlug — slug field present
describe("TC-111: getJobSlug — slug field present → slug returned", () => {
  it("returns slug field value without touching branch", () => {
    const state = makeMinimalState({ slug: "readme-status-section", branch: "feat/readme-status-section" });
    expect(getJobSlug(state)).toBe("readme-status-section");
  });
});

// TC-112: getJobSlug — slug null + branch with prefix
describe("TC-112: getJobSlug — slug null + branch with prefix → stripped branch", () => {
  it("returns prefix-stripped branch when slug is null", () => {
    const state = makeMinimalState({ slug: null, branch: "feat/readme-status-section" });
    expect(getJobSlug(state)).toBe("readme-status-section");
  });
  it("TC-102: divergent path/branch — branch suffix wins", () => {
    // request.path basename = dogfooding-001-request
    // branch = feat/readme-status-section → should return readme-status-section
    const state = makeMinimalState({
      slug: null,
      branch: "feat/readme-status-section",
      requestPath: "/tmp/dogfooding-001-request.md",
    });
    expect(getJobSlug(state)).toBe("readme-status-section");
  });
});

// TC-113: getJobSlug — slug null + empty branch → request.path basename
describe("TC-113: getJobSlug — slug null + empty branch → request.path basename", () => {
  it("returns basename without extension when branch is empty", () => {
    const state = makeMinimalState({
      slug: null,
      branch: "",
      requestPath: "/tmp/dogfooding-001-request.md",
    });
    expect(getJobSlug(state)).toBe("dogfooding-001-request");
  });
});

// TC-114: getJobSlug — all sources absent → ""
describe("TC-114: getJobSlug — all sources absent → empty string (no throw)", () => {
  it("returns empty string and does not throw", () => {
    const state = makeMinimalState({ slug: null, branch: "", requestPath: "" });
    expect(() => getJobSlug(state)).not.toThrow();
    expect(getJobSlug(state)).toBe("");
  });
});

// TC-116 / TC-117: run.ts canonical path detection logic (tested via regex)
describe("TC-116 / TC-117: canonical path detection (run.ts logic)", () => {
  const CANONICAL_PATTERN = /openspec-workflow\/requests\/(?:active|awaiting-merge)\/([^/]+)\/[^/]+\.md$/;

  it("TC-116: canonical active path → extracts slug", () => {
    const path = "openspec-workflow/requests/active/readme-status-section/request.md";
    const m = CANONICAL_PATTERN.exec(path);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("readme-status-section");
  });

  it("TC-116: canonical awaiting-merge path → extracts slug", () => {
    const path = "openspec-workflow/requests/awaiting-merge/finish-redesign/request.md";
    const m = CANONICAL_PATTERN.exec(path);
    expect(m).not.toBeNull();
    expect(m?.[1]).toBe("finish-redesign");
  });

  it("TC-117: /tmp/... non-canonical path → no match → null slug", () => {
    const path = "/tmp/dogfooding-001-request.md";
    const m = CANONICAL_PATTERN.exec(path);
    expect(m).toBeNull();
  });
});

// TC-118: legacy state file (no slug field) → load succeeds
describe("TC-118: legacy state without slug field → load succeeds + getJobSlug works", () => {
  it("validateJobState succeeds and request.slug === null when slug is absent", () => {
    const raw = {
      version: 1,
      jobId: "test-job-id",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      // No slug field in request
      request: { path: "/tmp/dogfooding-001-request.md", title: "Test", type: "feature" },
      repository: { owner: "user", name: "repo" },
      session: null,
      step: "init",
      status: "running",
      branch: "feat/readme-status-section",
      history: [],
      error: null,
    };
    const state = validateJobState(raw);
    expect(state.request.slug).toBeNull();
    // getJobSlug falls back to branch
    expect(getJobSlug(state)).toBe("readme-status-section");
  });
});
