/**
 * Unit tests for core/issue-target/archive.ts
 *
 * TC-008: 複数 completed marker のうち最新の jobId が選ばれる
 * TC-009: escalation marker のみの issue で ARCHIVE_FROM_ISSUE_NO_MARKER が throw される
 * TC-010: marker 不在の issue で ARCHIVE_FROM_ISSUE_NO_MARKER が throw される
 * TC-011: 4 点一意一致で branch / slug / checkpointOid が返る
 * TC-012: closing PR 0 件で ARCHIVE_FROM_ISSUE_NO_PR が throw される
 * TC-013: 複数 confirmed 候補で ARCHIVE_FROM_ISSUE_UNCONFIRMED が throw される
 * TC-014: PR number 不一致の候補が skip されて ARCHIVE_FROM_ISSUE_UNCONFIRMED になる
 * TC-021: parseCompletedJobId の round-trip と escalation marker での null 返却
 * TC-023: 3 つの error factory が正しい code と exitCode 2 を持つ
 * TC-024: archiveFromIssueNoPrError のメッセージに job attach --branch の案内が含まれる
 */
import { describe, it, expect, vi } from "vitest";
import {
  resolveCompletedJobId,
  resolveArchiveBranchFromIssue,
  type IssueArchiveClient,
} from "../archive.js";
import { buildMarker, parseCompletedJobId } from "../../notify/issue-notifier.js";
import {
  SpecRunnerError,
  ERROR_CODES,
  archiveFromIssueNoMarkerError,
  archiveFromIssueNoPrError,
  archiveFromIssueUnconfirmedError,
} from "../../../errors.js";
import type { SpawnFn } from "../../../util/spawn.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(overrides: Partial<IssueArchiveClient> = {}): IssueArchiveClient {
  return {
    listIssueComments: vi.fn().mockResolvedValue([]),
    listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeComment(kind: "completed" | "escalation", jobId: string, createdAt: string) {
  return {
    id: Math.random(),
    body: buildMarker(kind, jobId),
    authorAssociation: "OWNER",
    createdAt,
  };
}

/** Minimal valid state.json for 4-field identity check */
function makeStateJson(
  jobId: string,
  issueNumber: number,
  branch: string,
  prNumber: number,
): string {
  return JSON.stringify({
    jobId,
    issueNumber,
    branch,
    request: { slug: branch.replace(/^feat\//, "") },
    pullRequest: { number: prNumber, url: `https://github.com/o/r/pull/${prNumber}` },
  });
}

/** Build a SpawnFn that handles fetch + rev-parse + git show/ls-tree/cat-file calls */
function makeSpawnFn(
  branches: Record<string, { stateJson: string } | "fail">,
): SpawnFn {
  const branchForOid = (oid: string): string | undefined =>
    Object.keys(branches).find((b) => oid === `sha-${b}`);

  return vi.fn(async (_cmd: string, args: string[]) => {
    if (args[0] === "fetch" && args[1] === "origin") {
      const branch = args[2]!;
      return branches[branch] === "fail"
        ? { exitCode: 1, stdout: "", stderr: "failed" }
        : { exitCode: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "rev-parse") {
      const ref = args[1]!;
      const branch = ref.replace(/^origin\//, "").replace(/\^\{commit\}$/, "");
      return branches[branch] === "fail"
        ? { exitCode: 1, stdout: "", stderr: "failed" }
        : { exitCode: 0, stdout: `sha-${branch}`, stderr: "" };
    }
    if (args[0] === "ls-tree") {
      const oid = args.find((a) => a.startsWith("sha-")) ?? "";
      const branch = branchForOid(oid);
      if (!branch || branches[branch] === "fail") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      const entry = branches[branch] as { stateJson: string };
      const parsed = JSON.parse(entry.stateJson) as { request?: { slug?: string } };
      const slug = parsed.request?.slug ?? "test-slug";
      if (args.includes("-r")) {
        return {
          exitCode: 0,
          stdout: `specrunner/changes/${slug}/state.json\nspecrunner/changes/${slug}/events.jsonl`,
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: `specrunner/changes/${slug}`, stderr: "" };
    }
    if (args[0] === "cat-file") {
      const refPath = args[2] ?? "";
      const oid = refPath.split(":")[0] ?? "";
      const branch = branchForOid(oid);
      return branch && branches[branch] !== "fail"
        ? { exitCode: 0, stdout: "", stderr: "" }
        : { exitCode: 1, stdout: "", stderr: "not found" };
    }
    if (args[0] === "show") {
      const refPath = args[1] ?? "";
      const [oid, filePath] = refPath.split(":") as [string, string | undefined];
      const branch = branchForOid(oid);
      if (!branch || branches[branch] === "fail") {
        return { exitCode: 1, stdout: "", stderr: "not found" };
      }
      const entry = branches[branch] as { stateJson: string };
      if (filePath?.endsWith("state.json")) {
        return { exitCode: 0, stdout: entry.stateJson, stderr: "" };
      }
      return { exitCode: 1, stdout: "", stderr: "not found" };
    }
    return { exitCode: 0, stdout: "", stderr: "" };
  }) as unknown as SpawnFn;
}

// ---------------------------------------------------------------------------
// TC-021: parseCompletedJobId round-trip and null for escalation markers
// ---------------------------------------------------------------------------

describe("TC-021: parseCompletedJobId round-trip with buildMarker", () => {
  it("TC-021: round-trips the jobId through buildMarker(completed)", () => {
    const id = "job-uuid-completed-1234";
    const marker = buildMarker("completed", id);
    expect(parseCompletedJobId(marker)).toBe(id);
  });

  it("TC-021: returns null for escalation marker", () => {
    const escalationMarker = buildMarker("escalation", "some-job-id");
    expect(parseCompletedJobId(escalationMarker)).toBeNull();
  });

  it("TC-021: returns null for empty string", () => {
    expect(parseCompletedJobId("")).toBeNull();
  });

  it("TC-021: returns null for plain text", () => {
    expect(parseCompletedJobId("This is a human comment")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-008: newest completed marker wins when multiple exist
// ---------------------------------------------------------------------------

describe("TC-008: newest completed marker selects the jobId", () => {
  it("TC-008: returns jobId from the most recently created completed comment", async () => {
    const client = makeClient({
      listIssueComments: vi.fn().mockResolvedValue([
        makeComment("completed", "job-old", "2024-01-01T00:00:00Z"),
        makeComment("completed", "job-new", "2024-02-01T00:00:00Z"),
        makeComment("completed", "job-middle", "2024-01-15T00:00:00Z"),
      ]),
    });
    const jobId = await resolveCompletedJobId({ client, owner: "o", repo: "r", issueNumber: 5 });
    expect(jobId).toBe("job-new");
  });
});

// ---------------------------------------------------------------------------
// TC-009: escalation-only issue → ARCHIVE_FROM_ISSUE_NO_MARKER
// ---------------------------------------------------------------------------

describe("TC-009: escalation markers are ignored — ARCHIVE_FROM_ISSUE_NO_MARKER", () => {
  it("TC-009: throws ARCHIVE_FROM_ISSUE_NO_MARKER when only escalation markers exist", async () => {
    const client = makeClient({
      listIssueComments: vi.fn().mockResolvedValue([
        makeComment("escalation", "job-xyz", "2024-01-01T00:00:00Z"),
      ]),
    });
    await expect(
      resolveCompletedJobId({ client, owner: "o", repo: "r", issueNumber: 5 }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.ARCHIVE_FROM_ISSUE_NO_MARKER,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-010: no markers → ARCHIVE_FROM_ISSUE_NO_MARKER
// ---------------------------------------------------------------------------

describe("TC-010: no marker present is a typed error", () => {
  it("TC-010: throws ARCHIVE_FROM_ISSUE_NO_MARKER when comment list is empty", async () => {
    const client = makeClient({ listIssueComments: vi.fn().mockResolvedValue([]) });
    await expect(
      resolveCompletedJobId({ client, owner: "o", repo: "r", issueNumber: 5 }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.ARCHIVE_FROM_ISSUE_NO_MARKER,
    );
  });

  it("TC-010: throws ARCHIVE_FROM_ISSUE_NO_MARKER for human-only comments", async () => {
    const client = makeClient({
      listIssueComments: vi.fn().mockResolvedValue([
        { id: 1, body: "just a human comment", authorAssociation: "OWNER", createdAt: "2024-01-01T00:00:00Z" },
      ]),
    });
    await expect(
      resolveCompletedJobId({ client, owner: "o", repo: "r", issueNumber: 5 }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.ARCHIVE_FROM_ISSUE_NO_MARKER,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-012: closing PR 0 件 → ARCHIVE_FROM_ISSUE_NO_PR
// ---------------------------------------------------------------------------

describe("TC-012: zero closing PRs is a typed error", () => {
  it("TC-012: throws ARCHIVE_FROM_ISSUE_NO_PR when listIssueClosingPullRequests returns []", async () => {
    const client = makeClient({
      listIssueClosingPullRequests: vi.fn().mockResolvedValue([]),
    });
    const spawnFn = makeSpawnFn({});
    await expect(
      resolveArchiveBranchFromIssue({
        client,
        owner: "o",
        repo: "r",
        issueNumber: 5,
        jobId: "job-abc",
        spawnFn,
        cwd: "/repo",
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.ARCHIVE_FROM_ISSUE_NO_PR,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-011: 4-field unique match → returns branch/slug/checkpointOid
// ---------------------------------------------------------------------------

describe("TC-011: unique four-field match resolves the branch", () => {
  it("TC-011: returns branch/slug/checkpointOid for unique matching PR", async () => {
    const jobId = "job-abc123";
    const branch = "feat/my-feature";
    const issueNumber = 5;
    const prNumber = 42;
    const stateJson = makeStateJson(jobId, issueNumber, branch, prNumber);

    const client = makeClient({
      listIssueClosingPullRequests: vi.fn().mockResolvedValue([
        { number: prNumber, headRefName: branch },
      ]),
    });
    const spawnFn = makeSpawnFn({ [branch]: { stateJson } });

    const result = await resolveArchiveBranchFromIssue({
      client, owner: "o", repo: "r", issueNumber, jobId, spawnFn, cwd: "/repo",
    });
    expect(result.branch).toBe(branch);
    expect(result.checkpointOid).toBe(`sha-${branch}`);
    expect(result.slug).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-013: multiple confirmed candidates → ARCHIVE_FROM_ISSUE_UNCONFIRMED
// ---------------------------------------------------------------------------

describe("TC-013: multiple confirmed candidates is a typed error", () => {
  it("TC-013: throws ARCHIVE_FROM_ISSUE_UNCONFIRMED when two PRs both confirm", async () => {
    const jobId = "job-multi";
    const issueNumber = 5;
    const branch1 = "feat/branch-one";
    const branch2 = "feat/branch-two";
    const pr1 = 10;
    const pr2 = 11;

    const client = makeClient({
      listIssueClosingPullRequests: vi.fn().mockResolvedValue([
        { number: pr1, headRefName: branch1 },
        { number: pr2, headRefName: branch2 },
      ]),
    });
    const spawnFn = makeSpawnFn({
      [branch1]: { stateJson: makeStateJson(jobId, issueNumber, branch1, pr1) },
      [branch2]: { stateJson: makeStateJson(jobId, issueNumber, branch2, pr2) },
    });

    await expect(
      resolveArchiveBranchFromIssue({
        client, owner: "o", repo: "r", issueNumber, jobId, spawnFn, cwd: "/repo",
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.ARCHIVE_FROM_ISSUE_UNCONFIRMED,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-014: PR number mismatch causes skip → ARCHIVE_FROM_ISSUE_UNCONFIRMED
// ---------------------------------------------------------------------------

describe("TC-014: PR number mismatch causes the candidate to be skipped", () => {
  it("TC-014: candidate with wrong PR number is skipped → ARCHIVE_FROM_ISSUE_UNCONFIRMED", async () => {
    const jobId = "job-abc";
    const branch = "feat/my-feature";
    const issueNumber = 5;
    const correctPrNumber = 42;
    const wrongPrNumber = 99; // state.json has pr 42, but closing PR says 99
    const stateJson = makeStateJson(jobId, issueNumber, branch, correctPrNumber);

    const client = makeClient({
      listIssueClosingPullRequests: vi.fn().mockResolvedValue([
        { number: wrongPrNumber, headRefName: branch },
      ]),
    });
    const spawnFn = makeSpawnFn({ [branch]: { stateJson } });

    await expect(
      resolveArchiveBranchFromIssue({
        client, owner: "o", repo: "r", issueNumber, jobId, spawnFn, cwd: "/repo",
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.ARCHIVE_FROM_ISSUE_UNCONFIRMED,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-023: error factories have correct code and exitCode 2
// ---------------------------------------------------------------------------

describe("TC-023: error factories have correct code and exitCode 2", () => {
  it("TC-023: archiveFromIssueNoMarkerError has ARCHIVE_FROM_ISSUE_NO_MARKER code and exitCode 2", () => {
    const err = archiveFromIssueNoMarkerError(5);
    expect(err.code).toBe(ERROR_CODES.ARCHIVE_FROM_ISSUE_NO_MARKER);
    expect(err.exitCode).toBe(2);
  });

  it("TC-023: archiveFromIssueNoPrError has ARCHIVE_FROM_ISSUE_NO_PR code and exitCode 2", () => {
    const err = archiveFromIssueNoPrError(5);
    expect(err.code).toBe(ERROR_CODES.ARCHIVE_FROM_ISSUE_NO_PR);
    expect(err.exitCode).toBe(2);
  });

  it("TC-023: archiveFromIssueUnconfirmedError has ARCHIVE_FROM_ISSUE_UNCONFIRMED code and exitCode 2", () => {
    const err = archiveFromIssueUnconfirmedError("detail");
    expect(err.code).toBe(ERROR_CODES.ARCHIVE_FROM_ISSUE_UNCONFIRMED);
    expect(err.exitCode).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TC-024: archiveFromIssueNoPrError hint contains job attach --branch
// ---------------------------------------------------------------------------

describe("TC-024: archiveFromIssueNoPrError hint includes job attach --branch", () => {
  it("TC-024: hint includes 'job attach --branch'", () => {
    const err = archiveFromIssueNoPrError(5);
    expect(err.hint).toContain("job attach --branch");
  });
});
