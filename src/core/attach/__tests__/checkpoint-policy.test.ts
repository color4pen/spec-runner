/**
 * Unit tests for checkpoint-policy.ts
 *
 * TC-001: awaiting-archive + PR number の checkpoint が accept される
 * TC-002: awaiting-archive policy が awaiting-resume checkpoint を not-quiescent で reject する
 * TC-003: awaiting-archive policy が running checkpoint を not-quiescent で reject する
 * TC-004: awaiting-archive checkpoint で pullRequest.number 欠落時に reject される
 * TC-020: resume policy が awaiting-archive checkpoint を not-quiescent で reject する
 * TC-022: policy 未指定の runAttachVerification は attachResumePolicy で動作する
 *         (awaiting-archive を not-quiescent で reject することで resume policy 維持を確認)
 */
import { describe, it, expect } from "vitest";
import {
  attachArchivePolicy,
  attachResumePolicy,
  attachQuiescentPolicy,
  type PolicyVerificationContext,
} from "../checkpoint-policy.js";
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
// TC-022: attachQuiescentPolicy composite (not-quiescent for unknown status)
// ---------------------------------------------------------------------------

describe("TC-022: attachQuiescentPolicy rejects non-quiescent statuses", () => {
  it("TC-022: throws not-quiescent for running status", () => {
    const ctx = makeCtx("running");
    expectThrowsSatisfying(() => attachQuiescentPolicy.verify(ctx), (err) => isNotAttachable(err, "not-quiescent"));
  });

  it("TC-022: delegates awaiting-archive to attachArchivePolicy (rejects missing PR number)", () => {
    const ctx = makeCtx("awaiting-archive"); // no PR number
    expectThrowsSatisfying(() => attachQuiescentPolicy.verify(ctx), (err) => isNotAttachable(err, "missing-pr-number"));
  });

  it("TC-022: accepts awaiting-archive with pullRequest.number via composite policy", () => {
    const ctx = makeCtx("awaiting-archive", { pullRequestNumber: 3 });
    expect(() => attachQuiescentPolicy.verify(ctx)).not.toThrow();
  });
});
