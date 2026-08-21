/**
 * Unit tests for checkpoint-policy.ts
 *
 * TC-001: awaiting-archive + PR number の checkpoint が accept される
 * TC-002: awaiting-archive policy が awaiting-resume checkpoint を not-quiescent で reject する
 * TC-003: awaiting-archive policy が running checkpoint を not-quiescent で reject する
 * TC-004: awaiting-archive checkpoint で pullRequest.number 欠落時に reject される
 * TC-020: resume policy が awaiting-archive checkpoint を not-quiescent で reject する
 * TC-022: policy 未指定の runAttachVerification は attachResumePolicy で動作する
 *         (verifyCheckpoint に policy を渡さない → awaiting-archive を not-quiescent で reject)
 */
import { describe, it, expect } from "vitest";
import {
  attachArchivePolicy,
  attachResumePolicy,
  attachQuiescentPolicy,
  type PolicyVerificationContext,
} from "../checkpoint-policy.js";
import { verifyCheckpoint } from "../verify-checkpoint.js";
import { SpecRunnerError, ERROR_CODES } from "../../../errors.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(
  status: string,
  opts: { pullRequestNumber?: number } = {},
): PolicyVerificationContext {
  return {
    slug: "test-slug",
    treeFiles: [],
    state: {
      status: status as PolicyVerificationContext["state"]["status"],
      jobId: "job-test-id",
      branch: "feat/test",
      issueNumber: 42,
      repository: { owner: "owner", name: "repo" },
      request: { slug: "test-slug", path: "", baseBranch: "main" },
      pullRequest: opts.pullRequestNumber !== undefined
        ? { number: opts.pullRequestNumber, url: "https://github.com/owner/repo/pull/1" }
        : undefined,
    } as unknown as PolicyVerificationContext["state"],
  };
}

function isNotAttachable(err: unknown, reason?: string): boolean {
  return (
    err instanceof SpecRunnerError &&
    err.code === ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE &&
    (reason === undefined || err.message.includes(reason) || err.hint.includes(reason))
  );
}

/** Vitest's toThrow() does not accept predicate functions; use this instead. */
function expectThrowsSatisfying(fn: () => void, predicate: (err: unknown) => boolean): void {
  let caught: unknown;
  let threw = false;
  try {
    fn();
  } catch (e) {
    caught = e;
    threw = true;
  }
  expect(threw, "expected function to throw").toBe(true);
  expect(predicate(caught), "thrown error did not satisfy predicate").toBe(true);
}

// ---------------------------------------------------------------------------
// TC-001: awaiting-archive + PR number → accept
// ---------------------------------------------------------------------------

describe("TC-001: awaiting-archive + pullRequest.number → accepted by attachArchivePolicy", () => {
  it("TC-001: does not throw when status is awaiting-archive and pullRequest.number is set", () => {
    const ctx = makeCtx("awaiting-archive", { pullRequestNumber: 7 });
    expect(() => attachArchivePolicy.verify(ctx)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-002: awaiting-archive policy rejects awaiting-resume with not-quiescent
// ---------------------------------------------------------------------------

describe("TC-002: attachArchivePolicy rejects awaiting-resume with not-quiescent", () => {
  it("TC-002: throws CHECKPOINT_NOT_ATTACHABLE(not-quiescent) for awaiting-resume", () => {
    const ctx = makeCtx("awaiting-resume");
    expectThrowsSatisfying(() => attachArchivePolicy.verify(ctx), (err) => isNotAttachable(err, "not-quiescent"));
  });
});

// ---------------------------------------------------------------------------
// TC-003: awaiting-archive policy rejects running with not-quiescent
// ---------------------------------------------------------------------------

describe("TC-003: attachArchivePolicy rejects running with not-quiescent", () => {
  it("TC-003: throws CHECKPOINT_NOT_ATTACHABLE(not-quiescent) for running", () => {
    const ctx = makeCtx("running");
    expectThrowsSatisfying(() => attachArchivePolicy.verify(ctx), (err) => isNotAttachable(err, "not-quiescent"));
  });
});

// ---------------------------------------------------------------------------
// TC-004: awaiting-archive + missing pullRequest.number → reject
// ---------------------------------------------------------------------------

describe("TC-004: awaiting-archive without pullRequest.number is rejected", () => {
  it("TC-004: throws CHECKPOINT_NOT_ATTACHABLE(missing-pr-number) when pullRequest is absent", () => {
    const ctx = makeCtx("awaiting-archive"); // no pullRequestNumber
    expectThrowsSatisfying(() => attachArchivePolicy.verify(ctx), (err) => isNotAttachable(err, "missing-pr-number"));
  });

  it("TC-004: throws when pullRequest object exists but number is missing", () => {
    const ctx = makeCtx("awaiting-archive");
    // Set pullRequest without number
    (ctx.state as unknown as { pullRequest: unknown }).pullRequest = { url: "https://x" };
    expectThrowsSatisfying(() => attachArchivePolicy.verify(ctx), (err) => isNotAttachable(err, "missing-pr-number"));
  });
});

// ---------------------------------------------------------------------------
// TC-020: resume policy rejects awaiting-archive with not-quiescent
// ---------------------------------------------------------------------------

describe("TC-020: attachResumePolicy rejects awaiting-archive with not-quiescent", () => {
  it("TC-020: throws CHECKPOINT_NOT_ATTACHABLE(not-quiescent) for awaiting-archive", () => {
    const ctx = makeCtx("awaiting-archive", { pullRequestNumber: 5 });
    expectThrowsSatisfying(() => attachResumePolicy.verify(ctx), (err) => isNotAttachable(err, "not-quiescent"));
  });
});

// ---------------------------------------------------------------------------
// TC-022: policy 未指定の verifyCheckpoint は attachResumePolicy で動作する
// ---------------------------------------------------------------------------

/**
 * Minimal valid state.json for an awaiting-archive checkpoint.
 * All fields required by validateJobState are present.
 */
function makeArchiveStateJson(slug: string, branch: string): string {
  return JSON.stringify({
    version: 2,
    jobId: "job-tc-022",
    branch,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { slug, path: `specrunner/changes/${slug}/request.md`, baseBranch: "main" },
    repository: { owner: "owner", name: "repo" },
    step: "code-review",
    status: "awaiting-archive",
    history: [],
    steps: {},
    pullRequest: { number: 7, url: "https://github.com/owner/repo/pull/7" },
  });
}

describe("TC-022: verifyCheckpoint without policy defaults to attachResumePolicy", () => {
  it("TC-022: rejects awaiting-archive with not-quiescent when no policy is passed", async () => {
    const slug = "tc-022-slug";
    const branch = "feat/tc-022";
    const stateJson = makeArchiveStateJson(slug, branch);
    const treeFiles = [
      `specrunner/changes/${slug}/events.jsonl`,
      `specrunner/changes/${slug}/request.md`,
    ];

    await expect(
      verifyCheckpoint({
        slug,
        stateJson,
        eventsJsonl: "",
        treeFiles,
        branch,
        expectedRepo: { owner: "owner", name: "repo" },
        checkpointOid: "deadbeef",
        // policy omitted → defaults to attachResumePolicy
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CHECKPOINT_NOT_ATTACHABLE });
  });
});

// ---------------------------------------------------------------------------
// attachQuiescentPolicy composite: delegates by status
// ---------------------------------------------------------------------------

describe("attachQuiescentPolicy: delegates by status", () => {
  it("throws not-quiescent for running status", () => {
    const ctx = makeCtx("running");
    expectThrowsSatisfying(() => attachQuiescentPolicy.verify(ctx), (err) => isNotAttachable(err, "not-quiescent"));
  });

  it("delegates awaiting-archive to attachArchivePolicy (rejects missing PR number)", () => {
    const ctx = makeCtx("awaiting-archive"); // no PR number
    expectThrowsSatisfying(() => attachQuiescentPolicy.verify(ctx), (err) => isNotAttachable(err, "missing-pr-number"));
  });

  it("accepts awaiting-archive with pullRequest.number via composite policy", () => {
    const ctx = makeCtx("awaiting-archive", { pullRequestNumber: 3 });
    expect(() => attachQuiescentPolicy.verify(ctx)).not.toThrow();
  });
});
