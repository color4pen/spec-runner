/**
 * Tests for checkpoint-policy split (TC-001 through TC-011).
 *
 * TC-001: existing callers work without supplying a policy
 * TC-002: custom policy can be injected at call site
 * TC-003: generic checks fire even when a permissive policy is supplied (awaiting-archive passes)
 * TC-004: integrity failure rejects before policy is evaluated (journal-corrupted)
 * TC-005: attachResumePolicy rejects status not awaiting-resume (not-quiescent)
 * TC-006: attachResumePolicy rejects unresolvable resume point (resume-step-unresolvable)
 * TC-007: attachResumePolicy rejects missing reads() input (resume-input-missing)
 * TC-008: awaiting-archive checkpoint is rejected end-to-end (not-quiescent)
 * TC-009: valid awaiting-resume checkpoint is accepted end-to-end
 * TC-010: verify-checkpoint.ts has no direct resume-specific imports
 * TC-011: verify-checkpoint.ts contains no awaiting-resume status literal
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { verifyCheckpoint } from "../../src/core/attach/verify-checkpoint.js";
import { attachResumePolicy } from "../../src/core/attach/checkpoint-policy.js";
import { ERROR_CODES } from "../../src/errors.js";
import type { CheckpointVerificationPolicy, PolicyVerificationContext } from "../../src/core/attach/checkpoint-policy.js";
import type { NormalizedJobState } from "../../src/store/job-state-projection.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const SLUG = "my-feature";
const JOB_ID = "test-job-id-12345678";
const BRANCH = "feat/my-feature-1234abcd";
const EXPECTED_REPO = { owner: "acme", name: "repo" };
const CHECKPOINT_OID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

function makeStateJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    jobId: JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    request: {
      path: `/repo/specrunner/changes/${SLUG}/request.md`,
      title: "Test feature",
      type: "new-feature",
      slug: SLUG,
    },
    repository: { owner: EXPECTED_REPO.owner, name: EXPECTED_REPO.name },
    session: null,
    step: "implementer",
    status: "awaiting-resume",
    branch: BRANCH,
    history: [],
    error: null,
    pipelineId: "standard",
    resumePoint: {
      step: "implementer",
      reason: "interrupted",
      iterationsExhausted: 0,
    },
    ...overrides,
  });
}

const VALID_STATE_JSON = makeStateJson();
const ARCHIVE_STATE_JSON = makeStateJson({ status: "awaiting-archive", step: "pr-create", resumePoint: null });
const VALID_EVENTS_JSONL =
  `{"type":"interruption","ts":"2026-01-01T01:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":3}\n`;

const VALID_TREE_FILES = [
  `specrunner/changes/${SLUG}/state.json`,
  `specrunner/changes/${SLUG}/events.jsonl`,
  `specrunner/changes/${SLUG}/request.md`,
  `specrunner/changes/${SLUG}/tasks.md`,
  `specrunner/changes/${SLUG}/spec.md`,
];

const ARCHIVE_TREE_FILES = [
  `specrunner/changes/${SLUG}/state.json`,
  `specrunner/changes/${SLUG}/events.jsonl`,
  `specrunner/changes/${SLUG}/request.md`,
];

/** No-op stub policy: verify() does nothing (never throws). */
const noOpPolicy: CheckpointVerificationPolicy = { verify: () => undefined };

// ---------------------------------------------------------------------------
// TC-001: existing callers work without supplying a policy
// ---------------------------------------------------------------------------
describe("TC-001: existing callers work without supplying a policy", () => {
  it("verifyCheckpoint uses attachResumePolicy by default and accepts a valid awaiting-resume checkpoint", async () => {
    const result = await verifyCheckpoint({
      slug: SLUG,
      stateJson: VALID_STATE_JSON,
      eventsJsonl: VALID_EVENTS_JSONL,
      treeFiles: VALID_TREE_FILES,
      branch: BRANCH,
      expectedRepo: EXPECTED_REPO,
      checkpointOid: CHECKPOINT_OID,
    }); // no policy argument
    expect(result.slug).toBe(SLUG);
    expect(result.jobId).toBe(JOB_ID);
    expect(result.state.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-002: custom policy can be injected at call site
// ---------------------------------------------------------------------------
describe("TC-002: custom policy can be injected at call site", () => {
  it("calls policy.verify() with { state, slug, treeFiles } when a custom policy is supplied", async () => {
    let capturedCtx: PolicyVerificationContext | null = null;
    const spyPolicy: CheckpointVerificationPolicy = {
      verify(ctx) { capturedCtx = ctx; },
    };

    await verifyCheckpoint(
      {
        slug: SLUG,
        stateJson: ARCHIVE_STATE_JSON,
        eventsJsonl: "",
        treeFiles: ARCHIVE_TREE_FILES,
        branch: BRANCH,
        expectedRepo: EXPECTED_REPO,
        checkpointOid: CHECKPOINT_OID,
      },
      spyPolicy,
    );

    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.slug).toBe(SLUG);
    expect(capturedCtx!.treeFiles).toEqual(ARCHIVE_TREE_FILES);
    expect(capturedCtx!.state.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-003: generic checks fire even when a permissive policy is supplied
// ---------------------------------------------------------------------------
describe("TC-003: awaiting-archive + no-op policy passes verifyCheckpoint", () => {
  it("returns VerifiedCheckpoint for structurally intact awaiting-archive checkpoint with no-op policy", async () => {
    const result = await verifyCheckpoint(
      {
        slug: SLUG,
        stateJson: ARCHIVE_STATE_JSON,
        eventsJsonl: "",
        treeFiles: ARCHIVE_TREE_FILES,
        branch: BRANCH,
        expectedRepo: EXPECTED_REPO,
        checkpointOid: CHECKPOINT_OID,
      },
      noOpPolicy,
    );
    expect(result.slug).toBe(SLUG);
    expect(result.jobId).toBe(JOB_ID);
    expect(result.state.status).toBe("awaiting-archive");
  });
});

// ---------------------------------------------------------------------------
// TC-004: integrity failure rejects before policy is evaluated
// ---------------------------------------------------------------------------
describe("TC-004: integrity failure rejects before policy is evaluated (journal-corrupted)", () => {
  it("throws journal-corrupted before calling policy.verify() when events.jsonl is corrupted", async () => {
    let policyVerifyCalled = false;
    const recordingPolicy: CheckpointVerificationPolicy = {
      verify() { policyVerifyCalled = true; },
    };

    // NOT_VALID_JSON must be in the middle (not last) — fold() silently drops tail partials
    const corruptEvents = `{"type":"interruption","ts":"2026-01-01T01:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":3}\nNOT_VALID_JSON\n{"type":"interruption","ts":"2026-01-01T02:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":2}\n`;

    await expect(
      verifyCheckpoint(
        {
          slug: SLUG,
          stateJson: VALID_STATE_JSON,
          eventsJsonl: corruptEvents,
          treeFiles: VALID_TREE_FILES,
          branch: BRANCH,
          expectedRepo: EXPECTED_REPO,
          checkpointOid: CHECKPOINT_OID,
        },
        recordingPolicy,
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE, hint: expect.stringContaining("journal-corrupted") });

    expect(policyVerifyCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-005: attachResumePolicy rejects status not awaiting-resume (not-quiescent)
// ---------------------------------------------------------------------------
describe("TC-005: attachResumePolicy rejects status !== awaiting-resume", () => {
  it("throws not-quiescent when state.status is awaiting-archive", () => {
    const ctx: PolicyVerificationContext = {
      state: { status: "awaiting-archive" } as unknown as NormalizedJobState,
      slug: SLUG,
      treeFiles: [],
    };
    expect(() => attachResumePolicy.verify(ctx)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE, hint: expect.stringContaining("not-quiescent") }),
    );
  });

  it("throws not-quiescent when state.status is failed", () => {
    const ctx: PolicyVerificationContext = {
      state: { status: "failed" } as unknown as NormalizedJobState,
      slug: SLUG,
      treeFiles: [],
    };
    expect(() => attachResumePolicy.verify(ctx)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-006: attachResumePolicy rejects unresolvable resume point
// ---------------------------------------------------------------------------
describe("TC-006: attachResumePolicy rejects unresolvable resume point", () => {
  it("throws resume-step-unresolvable when resumePoint is null and state.step is not a valid step name", () => {
    // resumePoint = null + step not in allowed set → resolveResumeStep throws
    const ctx: PolicyVerificationContext = {
      state: {
        status: "awaiting-resume",
        pipelineId: "standard",
        resumePoint: null,
        step: "totally-nonexistent-step-xyz",
        reviewers: undefined,
      } as unknown as NormalizedJobState,
      slug: SLUG,
      treeFiles: [],
    };
    expect(() => attachResumePolicy.verify(ctx)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE, hint: expect.stringContaining("resume-step-unresolvable") }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-007: attachResumePolicy rejects missing reads() input
// ---------------------------------------------------------------------------
describe("TC-007: attachResumePolicy rejects missing reads() input", () => {
  it("throws resume-input-missing when implementer reads() requires tasks.md which is absent", () => {
    // Non-null resumePoint passes through resolveResumeStep directly
    // tasks.md is absent from treeFiles → resume-input-missing
    const treeFilesNoTasks = VALID_TREE_FILES.filter((f) => !f.endsWith("tasks.md"));
    const ctx: PolicyVerificationContext = {
      state: {
        status: "awaiting-resume",
        pipelineId: "standard",
        resumePoint: { step: "implementer", reason: "interrupted", iterationsExhausted: 0 },
        step: "implementer",
        reviewers: undefined,
        request: { slug: SLUG, type: "new-feature" },
      } as unknown as NormalizedJobState,
      slug: SLUG,
      treeFiles: treeFilesNoTasks,
    };
    expect(() => attachResumePolicy.verify(ctx)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE, hint: expect.stringContaining("resume-input-missing") }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-008: awaiting-archive checkpoint is rejected end-to-end (via verifyCheckpoint default policy)
// ---------------------------------------------------------------------------
describe("TC-008: awaiting-archive checkpoint is rejected end-to-end", () => {
  it("verifyCheckpoint with default policy rejects awaiting-archive with not-quiescent", async () => {
    await expect(
      verifyCheckpoint({
        slug: SLUG,
        stateJson: ARCHIVE_STATE_JSON,
        eventsJsonl: "",
        treeFiles: ARCHIVE_TREE_FILES,
        branch: BRANCH,
        expectedRepo: EXPECTED_REPO,
        checkpointOid: CHECKPOINT_OID,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE,
      hint: expect.stringContaining("not-quiescent"),
    });
  });
});

// ---------------------------------------------------------------------------
// TC-009: valid awaiting-resume checkpoint is accepted end-to-end
// ---------------------------------------------------------------------------
describe("TC-009: valid awaiting-resume checkpoint is accepted end-to-end", () => {
  it("verifyCheckpoint with default policy returns VerifiedCheckpoint for a valid awaiting-resume checkpoint", async () => {
    const result = await verifyCheckpoint({
      slug: SLUG,
      stateJson: VALID_STATE_JSON,
      eventsJsonl: VALID_EVENTS_JSONL,
      treeFiles: VALID_TREE_FILES,
      branch: BRANCH,
      expectedRepo: EXPECTED_REPO,
      checkpointOid: CHECKPOINT_OID,
    });
    expect(result.slug).toBe(SLUG);
    expect(result.jobId).toBe(JOB_ID);
    expect(result.branch).toBe(BRANCH);
    expect(result.state.status).toBe("awaiting-resume");
    expect(result.checkpointOid).toBe(CHECKPOINT_OID);
  });
});

// ---------------------------------------------------------------------------
// TC-010: verify-checkpoint.ts has no direct resume-specific imports
// ---------------------------------------------------------------------------
describe("TC-010: verify-checkpoint.ts has no direct resume-specific imports", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../src/core/attach/verify-checkpoint.ts"),
    "utf-8",
  );

  it("does not import getPipelineDescriptor", () => {
    expect(src).not.toMatch(/import.*getPipelineDescriptor/);
  });

  it("does not import getPipelineId", () => {
    expect(src).not.toMatch(/import.*getPipelineId/);
  });

  it("does not import resolveResumeStep", () => {
    expect(src).not.toMatch(/import.*resolveResumeStep/);
  });

  it("does not import buildAllowedStepSet", () => {
    expect(src).not.toMatch(/import.*buildAllowedStepSet/);
  });
});

// ---------------------------------------------------------------------------
// TC-011: verify-checkpoint.ts contains no awaiting-resume status literal
// ---------------------------------------------------------------------------
describe("TC-011: verify-checkpoint.ts contains no awaiting-resume status literal", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../src/core/attach/verify-checkpoint.ts"),
    "utf-8",
  );

  it('does not contain the string "awaiting-resume"', () => {
    expect(src).not.toContain('"awaiting-resume"');
  });
});
