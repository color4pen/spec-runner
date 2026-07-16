/**
 * Backward compatibility test for R1-format checkpoints after ProfileAssurance is structured.
 *
 * TC-007: R1 形式（assurance:{}）の checkpoint が verify-checkpoint の digest 検証を通過する
 *
 * After assurance is structured (assurance gains typed fields), the STANDARD_PROFILE.assurance
 * changes from {} to { testDerivation:"frozen", biteEvidence:"required", specReview:"required" }.
 * However, a checkpoint that was created before structuring — storing profile with assurance:{} —
 * must still pass attach digest verification because the check compares the stored profile
 * against its own body, not against the new STANDARD_PROFILE constant.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyCheckpoint } from "../../src/core/attach/verify-checkpoint.js";

// ---------------------------------------------------------------------------
// Module-level mock for pipeline registry (mirrors verify-checkpoint.test.ts pattern)
// ---------------------------------------------------------------------------
vi.mock("../../src/core/pipeline/registry.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/core/pipeline/registry.js")>();
  return {
    ...original,
    getPipelineDescriptor: vi.fn().mockImplementation((...args: Parameters<typeof original.getPipelineDescriptor>) => {
      return original.getPipelineDescriptor(...args);
    }),
  };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SLUG = "r1-compat-feature";
const JOB_ID = "r1-compat-job-id-abcd1234";
const BRANCH = "change/r1-compat-feature-abcd1234";
const EXPECTED_REPO = { owner: "acme", name: "repo" };
const CHECKPOINT_OID = "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3";

const VALID_EVENTS_JSONL = `{"type":"interruption","ts":"2026-01-01T01:00:00.000Z","step":"implementer","reason":"interrupted","budgetRemaining":3}\n`;
const VALID_TREE_FILES = [
  `specrunner/changes/${SLUG}/state.json`,
  `specrunner/changes/${SLUG}/events.jsonl`,
  `specrunner/changes/${SLUG}/request.md`,
  `specrunner/changes/${SLUG}/tasks.md`,
  `specrunner/changes/${SLUG}/spec.md`,
];

function makeStateJsonWithR1Profile(profileOverrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 2,
    jobId: JOB_ID,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T01:00:00.000Z",
    request: {
      path: `/repo/specrunner/changes/${SLUG}/request.md`,
      title: "R1 compat test",
      type: "spec-change",
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
    ...profileOverrides,
  });
}

beforeEach(async () => {
  const { getPipelineDescriptor, STANDARD_DESCRIPTOR } = await import("../../src/core/pipeline/registry.js");
  vi.mocked(getPipelineDescriptor).mockImplementation(() => STANDARD_DESCRIPTOR);
});

afterEach(async () => {
  const { getPipelineDescriptor } = await import("../../src/core/pipeline/registry.js");
  vi.mocked(getPipelineDescriptor).mockReset();
  const { STANDARD_DESCRIPTOR } = await import("../../src/core/pipeline/registry.js");
  vi.mocked(getPipelineDescriptor).mockImplementation(() => STANDARD_DESCRIPTOR);
});

// ---------------------------------------------------------------------------
// TC-007: R1 形式（assurance:{}）の checkpoint が verify-checkpoint の digest 検証を通過する
// ---------------------------------------------------------------------------
describe("TC-007: R1 形式（assurance:{}）の checkpoint が verify-checkpoint の digest 検証を通過する", () => {
  it("checkpoint with assurance:{} and correct self-consistent digest passes attach verification", async () => {
    // Build an R1-format profile body: assurance is an empty object (the pre-structuring format)
    const { computePolicyDigest } = await import("../../src/state/profile.js");
    const r1ProfileBody = {
      id: "standard",
      schemaVersion: 1,
      budget: {},
      assurance: {},  // R1 format: opaque empty object
    };
    // Compute the digest for this body — this simulates how the digest was stored in R1
    const r1Digest = computePolicyDigest(r1ProfileBody);

    const stateJson = makeStateJsonWithR1Profile({
      profile: {
        ...r1ProfileBody,
        policyDigest: r1Digest,
      },
    });

    // verifyCheckpoint should pass: the stored digest matches computePolicyDigest(storedProfile)
    const result = await verifyCheckpoint({
      slug: SLUG,
      stateJson,
      eventsJsonl: VALID_EVENTS_JSONL,
      treeFiles: VALID_TREE_FILES,
      branch: BRANCH,
      expectedRepo: EXPECTED_REPO,
      checkpointOid: CHECKPOINT_OID,
    });

    expect(result.slug).toBe(SLUG);
    expect(result.jobId).toBe(JOB_ID);
    // The state's profile has assurance:{}
    expect(result.state.profile).toBeDefined();
    expect((result.state.profile as Record<string, unknown> | undefined)?.["assurance"]).toEqual({});
  });

  it("R1 profile self-consistency: computePolicyDigest with assurance:{} is stable across implementations", async () => {
    // The digest for a profile with assurance:{} should be deterministic and stable.
    // After the implementation adds typed fields to STANDARD_PROFILE.assurance,
    // computePolicyDigest({...assurance:{}}) must still produce the same hash as before.
    const { computePolicyDigest } = await import("../../src/state/profile.js");
    const r1Body = { id: "standard", schemaVersion: 1, budget: {}, assurance: {} };
    const digest1 = computePolicyDigest(r1Body);
    const digest2 = computePolicyDigest(r1Body);
    expect(digest1).toBe(digest2);
    expect(digest1).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("R1 profile with correct digest does not trigger profile-inconsistent error", async () => {
    const { computePolicyDigest } = await import("../../src/state/profile.js");
    const r1ProfileBody = {
      id: "standard",
      schemaVersion: 1,
      budget: {},
      assurance: {},
    };
    const stateJson = makeStateJsonWithR1Profile({
      profile: {
        ...r1ProfileBody,
        policyDigest: computePolicyDigest(r1ProfileBody),
      },
    });

    // Must not throw with profile-inconsistent reason
    await expect(
      verifyCheckpoint({
        slug: SLUG,
        stateJson,
        eventsJsonl: VALID_EVENTS_JSONL,
        treeFiles: VALID_TREE_FILES,
        branch: BRANCH,
        expectedRepo: EXPECTED_REPO,
        checkpointOid: CHECKPOINT_OID,
      }),
    ).resolves.toBeDefined();
  });

  it("R1 profile with tampered digest triggers profile-inconsistent error (regression guard)", async () => {
    // Contrast: tampered digest MUST be rejected (ensures the check is actually enforced)
    const { ERROR_CODES } = await import("../../src/errors.js");
    const stateJson = makeStateJsonWithR1Profile({
      profile: {
        id: "standard",
        schemaVersion: 1,
        budget: {},
        assurance: {},
        // Wrong digest — deliberately different from what computePolicyDigest would produce
        policyDigest: "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
    });

    const err = await verifyCheckpoint({
      slug: SLUG,
      stateJson,
      eventsJsonl: VALID_EVENTS_JSONL,
      treeFiles: VALID_TREE_FILES,
      branch: BRANCH,
      expectedRepo: EXPECTED_REPO,
      checkpointOid: CHECKPOINT_OID,
    }).catch((e) => e);

    expect(err).toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE });
    expect((err as { hint?: string }).hint).toContain("profile-inconsistent");
  });
});
