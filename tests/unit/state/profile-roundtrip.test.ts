/**
 * Unit tests for profile in buildInitialJobState, state-store round-trip, and immutability (T-04 / T-05 / T-07).
 *
 * TC-PROFRT-001: buildInitialJobState includes STANDARD_PROFILE when profile absent
 * TC-PROFRT-002: profile absent in legacy state JSON loads without error, other fields preserved
 * TC-PROFRT-003: profile present in initial state persists and loads unchanged (branch-borne)
 * TC-PROFRT-004: transitionJob preserves profile across awaiting-resume → running → awaiting-archive
 * TC-PROFRT-005: profile cannot be passed in patch (TypeScript compile-time enforcement)
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { buildInitialJobState, JobStateStore } from "../../../src/store/job-state-store.js";
import { validateJobState } from "../../../src/state/schema.js";
import { STANDARD_PROFILE } from "../../../src/state/profile.js";
import { transitionJob } from "../../../src/state/lifecycle.js";
import type { JobState } from "../../../src/state/schema.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-prof-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

const JOB_ID = "00000000-0000-0000-0000-000000000002";
const SLUG = "profile-test";
const REPO_ROOT = "/fake/repo";

// ---------------------------------------------------------------------------
// TC-PROFRT-001: buildInitialJobState includes STANDARD_PROFILE
// ---------------------------------------------------------------------------
describe("TC-PROFRT-001: buildInitialJobState includes STANDARD_PROFILE", () => {
  it("profile is STANDARD_PROFILE when not specified", () => {
    const state = buildInitialJobState({
      request: { path: "/repo/specrunner/changes/test/request.md", title: "Test", type: "spec-change" },
      repository: { owner: "user", name: "repo" },
    });
    expect(state.profile).toBeDefined();
    expect(state.profile).toEqual(STANDARD_PROFILE);
  });

  it("profile is STANDARD_PROFILE even when pipelineId is specified", () => {
    const state = buildInitialJobState({
      request: { path: "/repo/specrunner/changes/test/request.md", title: "Test", type: "spec-change" },
      repository: { owner: "user", name: "repo" },
      pipelineId: "standard",
    });
    expect(state.profile).toEqual(STANDARD_PROFILE);
  });

  it("custom profile can be passed and is used", () => {
    const customProfile = { ...STANDARD_PROFILE, id: "custom-for-test" };
    const state = buildInitialJobState({
      request: { path: "/repo/specrunner/changes/test/request.md", title: "Test", type: "spec-change" },
      repository: { owner: "user", name: "repo" },
      profile: customProfile,
    });
    expect(state.profile).toEqual(customProfile);
  });
});

// ---------------------------------------------------------------------------
// TC-PROFRT-002: legacy state JSON (profile absent) loads without error
// ---------------------------------------------------------------------------
describe("TC-PROFRT-002: profile absent in legacy state JSON loads without error", () => {
  it("validateJobState passes with profile absent, and other fields are preserved", () => {
    const legacyState = {
      version: 2,
      jobId: JOB_ID,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      request: { path: "/repo/specrunner/changes/test/request.md", title: "Test", type: "spec-change", slug: "test" },
      repository: { owner: "user", name: "repo" },
      session: null,
      step: "init",
      status: "awaiting-resume",
      branch: "change/test-abc",
      history: [],
      error: null,
      pipelineId: "standard",
      // profile is intentionally absent
    };

    const validated = validateJobState(legacyState);
    // profile should remain absent (undefined) — validateJobState does not inject it
    expect((validated as unknown as Record<string, unknown>)["profile"]).toBeUndefined();
    // Other required fields are preserved
    expect(validated.jobId).toBe(JOB_ID);
    expect(validated.pipelineId).toBe("standard");
  });
});

// ---------------------------------------------------------------------------
// TC-PROFRT-003: profile persists and loads unchanged (branch-borne)
// ---------------------------------------------------------------------------
describe("TC-PROFRT-003: profile persists and loads unchanged", () => {
  it("profile in initial state is preserved through persist → load round-trip", async () => {
    const changeDir = path.join(tempDir, "specrunner", "changes", SLUG);
    await fs.mkdir(changeDir, { recursive: true });

    const state = buildInitialJobState({
      request: { path: `/repo/specrunner/changes/${SLUG}/request.md`, title: "Test", type: "spec-change", slug: SLUG },
      repository: { owner: "user", name: "repo" },
    });
    // Override jobId for determinism
    const initialState: JobState = { ...state, jobId: JOB_ID, branch: `change/${SLUG}-abc` };

    const store = new JobStateStore(JOB_ID, REPO_ROOT, { slug: SLUG, stateRoot: tempDir, changeDir });
    await store.persist(initialState);

    const loaded = await store.load();
    expect(loaded.profile).toEqual(STANDARD_PROFILE);
  });
});

// ---------------------------------------------------------------------------
// TC-PROFRT-004: profile is preserved across transitionJob state transitions
// ---------------------------------------------------------------------------
describe("TC-PROFRT-004: transitionJob preserves profile across status transitions", () => {
  it("profile is unchanged from running → awaiting-resume → running → awaiting-archive", () => {
    const base = buildInitialJobState({
      request: { path: "/repo/request.md", title: "Test", type: "spec-change" },
      repository: { owner: "user", name: "repo" },
    });
    const withBranch: JobState = { ...base, branch: "change/test-abc" };

    // running → awaiting-resume
    const { state: s1 } = transitionJob(withBranch, "awaiting-resume", {
      trigger: "pipeline",
      reason: "step interrupted",
    });
    expect(s1.profile).toEqual(STANDARD_PROFILE);

    // awaiting-resume → running
    const { state: s2 } = transitionJob(s1, "running", {
      trigger: "resume",
      reason: "resumed by operator",
    });
    expect(s2.profile).toEqual(STANDARD_PROFILE);

    // running → awaiting-archive
    const { state: s3 } = transitionJob(s2, "awaiting-archive", {
      trigger: "pipeline",
      reason: "pipeline complete",
    });
    expect(s3.profile).toEqual(STANDARD_PROFILE);
  });

  it("profile is preserved when patch is applied in transitionJob", () => {
    const base = buildInitialJobState({
      request: { path: "/repo/request.md", title: "Test", type: "spec-change" },
      repository: { owner: "user", name: "repo" },
    });
    const withBranch: JobState = { ...base, branch: "change/test-abc" };

    const { state } = transitionJob(withBranch, "awaiting-resume", {
      trigger: "pipeline",
      reason: "interrupted",
      patch: { step: "implementer" },
    });
    expect(state.profile).toEqual(STANDARD_PROFILE);
    expect(state.step).toBe("implementer");
  });
});
