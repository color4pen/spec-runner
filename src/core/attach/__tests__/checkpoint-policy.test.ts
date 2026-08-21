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
import { runAttachVerification } from "../orchestrator.js";
import type { SpawnFn } from "../../../util/spawn.js";
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
// TC-022: policy 未指定の runAttachVerification は attachResumePolicy で動作する
// ---------------------------------------------------------------------------

// Fixture constants for the mock checkpoint
const TC022_SLUG = "tc-022-slug";
const TC022_BRANCH = "feat/tc-022";
const TC022_OID = "deadbeefcafe";
const TC022_CHANGE_DIR = `specrunner/changes/${TC022_SLUG}`;

const TC022_ARCHIVE_STATE_JSON = JSON.stringify({
  version: 2,
  jobId: "job-tc-022",
  branch: TC022_BRANCH,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  request: { slug: TC022_SLUG, path: `${TC022_CHANGE_DIR}/request.md`, baseBranch: "main" },
  repository: { owner: "owner", name: "repo" },
  step: "code-review",
  status: "awaiting-archive",
  history: [],
  steps: {},
  pullRequest: { number: 7, url: "https://github.com/owner/repo/pull/7" },
});

/**
 * SpawnFn fixture that simulates a remote branch containing an awaiting-archive
 * checkpoint. Handles the git calls issued by runAttachVerification and
 * readCheckpointFromRef (fetch → rev-parse → ls-tree → cat-file → show × 2 → ls-tree -r).
 */
function makeTC022SpawnFn(): SpawnFn {
  return async (_cmd, args, _opts) => {
    const ok = (stdout = ""): { exitCode: number; stdout: string; stderr: string } =>
      ({ exitCode: 0, stdout, stderr: "" });

    if (args[0] === "fetch") return ok();
    if (args[0] === "rev-parse") return ok(`${TC022_OID}\n`);
    if (args[0] === "cat-file") return ok();
    if (args[0] === "show" && args[1]?.includes("state.json")) return ok(TC022_ARCHIVE_STATE_JSON);
    if (args[0] === "show" && args[1]?.includes("events.jsonl")) return ok("");
    // ls-tree -r: return treeFiles
    if (args[0] === "ls-tree" && args.includes("-r")) {
      return ok([
        `${TC022_CHANGE_DIR}/events.jsonl`,
        `${TC022_CHANGE_DIR}/request.md`,
        `${TC022_CHANGE_DIR}/state.json`,
      ].join("\n") + "\n");
    }
    // ls-tree (slug discovery): return the change folder path
    if (args[0] === "ls-tree") return ok(`${TC022_CHANGE_DIR}\n`);
    return { exitCode: 1, stdout: "", stderr: `unexpected: ${args.join(" ")}` };
  };
}

describe("TC-022: runAttachVerification without policy defaults to attachResumePolicy", () => {
  it("TC-022: rejects awaiting-archive with not-quiescent when no policy is passed", async () => {
    await expect(
      runAttachVerification({
        cwd: "/tmp",
        branch: TC022_BRANCH,
        spawnFn: makeTC022SpawnFn(),
        expectedRepo: { owner: "owner", name: "repo" },
        // policy omitted → verifyCheckpoint defaults to attachResumePolicy
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
