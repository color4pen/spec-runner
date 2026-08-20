/**
 * Unit tests for core/issue-target/resume.ts
 *
 * TC-004: newest escalation comment selects the jobId
 * TC-005: issueNumber mismatch is rejected fail-closed
 * TC-006: jobId mismatch is rejected fail-closed
 * TC-007: multiple simultaneously-confirmed candidates are rejected
 * TC-008: no marker present stops with RESUME_FROM_ISSUE_NO_MARKER
 * TC-009: zero linked branches → RESUME_FROM_ISSUE_NO_LINK
 * TC-015: parseEscalationJobId round-trip with buildMarker
 * TC-016: parseEscalationJobId returns null for non-escalation bodies
 * TC-024: spoofed escalation marker with mismatched checkpoint is rejected
 * TC-025: unreadable candidate branches are skipped without blocking a match
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveEscalationJobId,
  resolveResumeBranchFromIssue,
  type IssueResumeClient,
} from "../resume.js";
import { buildMarker, parseEscalationJobId } from "../../notify/issue-notifier.js";
import { SpecRunnerError, ERROR_CODES } from "../../../errors.js";
import type { SpawnFn } from "../../../util/spawn.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(overrides: Partial<IssueResumeClient> = {}): IssueResumeClient {
  return {
    listIssueComments: vi.fn().mockResolvedValue([]),
    listIssueLinkedBranches: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeComment(jobId: string, createdAt: string) {
  return {
    id: Math.random(),
    body: buildMarker("escalation", jobId),
    authorAssociation: "OWNER",
    createdAt,
  };
}

/** Minimal valid state.json fields for identity check */
function makeStateJson(jobId: string, issueNumber: number, branch: string): string {
  return JSON.stringify({
    jobId,
    issueNumber,
    branch,
    request: { slug: branch.replace(/^feat\//, "") },
  });
}

/** Build a SpawnFn that handles fetch + rev-parse + git show/ls-tree/cat-file calls */
function makeSpawnFn(branches: Record<string, { stateJson: string } | "fail">): SpawnFn {
  /** Find branch name for a given OID (format: "sha-<branch>") */
  const branchForOid = (oid: string): string | undefined =>
    Object.keys(branches).find((b) => oid === `sha-${b}`);

  return vi.fn(async (_cmd: string, args: string[]) => {
    // git fetch origin <branch>
    if (args[0] === "fetch" && args[1] === "origin") {
      const branch = args[2]!;
      return branches[branch] === "fail"
        ? { exitCode: 1, stdout: "", stderr: "failed" }
        : { exitCode: 0, stdout: "", stderr: "" };
    }

    // git rev-parse origin/<branch>^{commit}
    if (args[0] === "rev-parse") {
      const ref = args[1]!;
      const branch = ref.replace(/^origin\//, "").replace(/\^\{commit\}$/, "");
      return branches[branch] === "fail"
        ? { exitCode: 1, stdout: "", stderr: "failed" }
        : { exitCode: 0, stdout: `sha-${branch}`, stderr: "" };
    }

    // git ls-tree — find the OID anywhere in args (it's the first sha- prefixed arg)
    if (args[0] === "ls-tree") {
      const oid = args.find((a) => a.startsWith("sha-")) ?? "";
      const branch = branchForOid(oid);
      if (!branch || branches[branch] === "fail") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      const entry = branches[branch] as { stateJson: string };
      const parsed = JSON.parse(entry.stateJson) as { request?: { slug?: string } };
      const slug = parsed.request?.slug ?? "test-slug";
      // Recursive form (-r): return individual files
      if (args.includes("-r")) {
        return {
          exitCode: 0,
          stdout: `specrunner/changes/${slug}/state.json\nspecrunner/changes/${slug}/events.jsonl`,
          stderr: "",
        };
      }
      // Non-recursive: return change folder entry
      return { exitCode: 0, stdout: `specrunner/changes/${slug}`, stderr: "" };
    }

    // git cat-file -e <oid>:<path>
    if (args[0] === "cat-file") {
      const refPath = args[2] ?? "";
      const oid = refPath.split(":")[0] ?? "";
      const branch = branchForOid(oid);
      return branch && branches[branch] !== "fail"
        ? { exitCode: 0, stdout: "", stderr: "" }
        : { exitCode: 1, stdout: "", stderr: "not found" };
    }

    // git show <oid>:<path>
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
      // events.jsonl or other files: not found (optional)
      return { exitCode: 1, stdout: "", stderr: "not found" };
    }

    return { exitCode: 0, stdout: "", stderr: "" };
  }) as unknown as SpawnFn;
}

// ---------------------------------------------------------------------------
// TC-015: parseEscalationJobId round-trip with buildMarker
// ---------------------------------------------------------------------------

describe("TC-015: parseEscalationJobId round-trip with buildMarker", () => {
  it("TC-015: round-trips the jobId through buildMarker", () => {
    const id = "job-uuid-1234-5678-abcd";
    const marker = buildMarker("escalation", id);
    expect(parseEscalationJobId(marker)).toBe(id);
  });

  it("TC-015: works for arbitrary valid jobId strings", () => {
    const ids = ["a", "simple-id", "job-01234567-89ab-cdef-0123-456789abcdef"];
    for (const id of ids) {
      expect(parseEscalationJobId(buildMarker("escalation", id))).toBe(id);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-016: parseEscalationJobId returns null for non-escalation bodies
// ---------------------------------------------------------------------------

describe("TC-016: parseEscalationJobId returns null when no escalation marker present", () => {
  it("TC-016: empty string → null", () => {
    expect(parseEscalationJobId("")).toBeNull();
  });

  it("TC-016: plain text → null", () => {
    expect(parseEscalationJobId("This is a human comment")).toBeNull();
  });

  it("TC-016: completed marker only → null", () => {
    const completedMarker = buildMarker("completed", "some-job-id");
    expect(parseEscalationJobId(completedMarker)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-008: no marker present → RESUME_FROM_ISSUE_NO_MARKER
// ---------------------------------------------------------------------------

describe("TC-008: no marker present stops with RESUME_FROM_ISSUE_NO_MARKER", () => {
  it("TC-008: throws RESUME_FROM_ISSUE_NO_MARKER when no escalation comment exists", async () => {
    const client = makeClient({
      listIssueComments: vi.fn().mockResolvedValue([
        { id: 1, body: "just a human comment", authorAssociation: "OWNER", createdAt: "2024-01-01T00:00:00Z" },
        { id: 2, body: buildMarker("completed", "job-xyz"), authorAssociation: "BOT", createdAt: "2024-01-02T00:00:00Z" },
      ]),
    });
    await expect(
      resolveEscalationJobId({ client, owner: "o", repo: "r", issueNumber: 5 }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.RESUME_FROM_ISSUE_NO_MARKER,
    );
  });

  it("TC-008: throws RESUME_FROM_ISSUE_NO_MARKER when comment list is empty", async () => {
    const client = makeClient({ listIssueComments: vi.fn().mockResolvedValue([]) });
    await expect(
      resolveEscalationJobId({ client, owner: "o", repo: "r", issueNumber: 5 }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.RESUME_FROM_ISSUE_NO_MARKER,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-004: newest escalation comment selects the jobId
// ---------------------------------------------------------------------------

describe("TC-004: newest escalation comment selects the jobId", () => {
  it("TC-004: returns jobId from the most recently created escalation comment", async () => {
    const client = makeClient({
      listIssueComments: vi.fn().mockResolvedValue([
        makeComment("job-old", "2024-01-01T00:00:00Z"),
        makeComment("job-new", "2024-02-01T00:00:00Z"),
        makeComment("job-middle", "2024-01-15T00:00:00Z"),
      ]),
    });
    const jobId = await resolveEscalationJobId({ client, owner: "o", repo: "r", issueNumber: 5 });
    expect(jobId).toBe("job-new");
  });

  it("TC-004: returns the single marker's jobId when only one exists", async () => {
    const client = makeClient({
      listIssueComments: vi.fn().mockResolvedValue([
        makeComment("job-only", "2024-01-01T00:00:00Z"),
      ]),
    });
    const jobId = await resolveEscalationJobId({ client, owner: "o", repo: "r", issueNumber: 5 });
    expect(jobId).toBe("job-only");
  });
});

// ---------------------------------------------------------------------------
// TC-009: zero linked branches → RESUME_FROM_ISSUE_NO_LINK
// ---------------------------------------------------------------------------

describe("TC-009: zero linked branches guides to job attach", () => {
  it("TC-009: throws RESUME_FROM_ISSUE_NO_LINK when no linked branches", async () => {
    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([]),
    });
    const spawnFn = makeSpawnFn({});
    await expect(
      resolveResumeBranchFromIssue({
        client,
        owner: "o",
        repo: "r",
        issueNumber: 5,
        jobId: "job-abc",
        spawnFn,
        cwd: "/repo",
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.RESUME_FROM_ISSUE_NO_LINK,
    );
  });

  it("TC-009: RESUME_FROM_ISSUE_NO_LINK hint references job attach --branch", async () => {
    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([]),
    });
    const spawnFn = makeSpawnFn({});
    let err: SpecRunnerError | null = null;
    try {
      await resolveResumeBranchFromIssue({
        client,
        owner: "o",
        repo: "r",
        issueNumber: 5,
        jobId: "job-abc",
        spawnFn,
        cwd: "/repo",
      });
    } catch (e) {
      err = e as SpecRunnerError;
    }
    expect(err).not.toBeNull();
    expect(err!.hint).toContain("job attach --branch");
  });
});

// ---------------------------------------------------------------------------
// TC-001/TC-002: linked branch / linked PR head forms resolve through the full chain
// ---------------------------------------------------------------------------

describe("TC-001: linked branch form resolves through the full chain", () => {
  it("TC-001: single matching branch confirms via 3-field identity check", async () => {
    const jobId = "job-abc123";
    const branch = "feat/my-feature";
    const issueNumber = 5;
    const stateJson = makeStateJson(jobId, issueNumber, branch);

    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([branch]),
    });
    const spawnFn = makeSpawnFn({ [branch]: { stateJson } });

    const result = await resolveResumeBranchFromIssue({
      client, owner: "o", repo: "r", issueNumber, jobId, spawnFn, cwd: "/repo",
    });
    expect(result.branch).toBe(branch);
    expect(result.checkpointOid).toBe(`sha-${branch}`);
  });
});

describe("TC-002: linked PR head form resolves through the full chain", () => {
  it("TC-002: branch from closedByPullRequestsReferences confirms via identity check", async () => {
    const jobId = "job-pr-form";
    const branch = "fix/the-bug";
    const issueNumber = 7;
    const stateJson = makeStateJson(jobId, issueNumber, branch);

    // Simulates closedByPullRequestsReferences returning this branch name
    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([branch]),
    });
    const spawnFn = makeSpawnFn({ [branch]: { stateJson } });

    const result = await resolveResumeBranchFromIssue({
      client, owner: "o", repo: "r", issueNumber, jobId, spawnFn, cwd: "/repo",
    });
    expect(result.branch).toBe(branch);
  });
});

// ---------------------------------------------------------------------------
// TC-005: issueNumber mismatch is rejected fail-closed
// ---------------------------------------------------------------------------

describe("TC-005: issueNumber mismatch is rejected fail-closed", () => {
  it("TC-005: branch with wrong issueNumber throws RESUME_FROM_ISSUE_UNCONFIRMED", async () => {
    const jobId = "job-abc";
    const branch = "feat/my-feature";
    // state.json has issueNumber=99, but we search for issueNumber=5
    const stateJson = makeStateJson(jobId, 99, branch);

    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([branch]),
    });
    const spawnFn = makeSpawnFn({ [branch]: { stateJson } });

    await expect(
      resolveResumeBranchFromIssue({
        client, owner: "o", repo: "r", issueNumber: 5, jobId, spawnFn, cwd: "/repo",
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.RESUME_FROM_ISSUE_UNCONFIRMED,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-006: jobId mismatch is rejected fail-closed
// ---------------------------------------------------------------------------

describe("TC-006: jobId mismatch is rejected fail-closed", () => {
  it("TC-006: branch with wrong jobId throws RESUME_FROM_ISSUE_UNCONFIRMED", async () => {
    const branch = "feat/my-feature";
    // state.json has jobId="job-real" but we search for "job-fake"
    const stateJson = makeStateJson("job-real", 5, branch);

    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([branch]),
    });
    const spawnFn = makeSpawnFn({ [branch]: { stateJson } });

    await expect(
      resolveResumeBranchFromIssue({
        client, owner: "o", repo: "r", issueNumber: 5, jobId: "job-fake", spawnFn, cwd: "/repo",
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.RESUME_FROM_ISSUE_UNCONFIRMED,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-007: multiple simultaneously-confirmed candidates are rejected
// ---------------------------------------------------------------------------

describe("TC-007: multiple simultaneously-confirmed candidates are rejected", () => {
  it("TC-007: two branches both passing identity check → RESUME_FROM_ISSUE_UNCONFIRMED", async () => {
    const jobId = "job-multi";
    const issueNumber = 5;
    const branch1 = "feat/branch-one";
    const branch2 = "feat/branch-two";

    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([branch1, branch2]),
    });
    const spawnFn = makeSpawnFn({
      [branch1]: { stateJson: makeStateJson(jobId, issueNumber, branch1) },
      [branch2]: { stateJson: makeStateJson(jobId, issueNumber, branch2) },
    });

    await expect(
      resolveResumeBranchFromIssue({
        client, owner: "o", repo: "r", issueNumber, jobId, spawnFn, cwd: "/repo",
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.RESUME_FROM_ISSUE_UNCONFIRMED,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-024: spoofed escalation marker with mismatched checkpoint is rejected
// ---------------------------------------------------------------------------

describe("TC-024: spoofed marker with mismatched checkpoint is rejected by identity check", () => {
  it("TC-024: fabricated jobId in marker fails when checkpoint has different jobId", async () => {
    const spoofedJobId = "J-fake";
    const branch = "feat/real-branch";
    // real checkpoint has a different jobId
    const stateJson = makeStateJson("J-real", 5, branch);

    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([branch]),
    });
    const spawnFn = makeSpawnFn({ [branch]: { stateJson } });

    await expect(
      resolveResumeBranchFromIssue({
        client, owner: "o", repo: "r", issueNumber: 5, jobId: spoofedJobId, spawnFn, cwd: "/repo",
      }),
    ).rejects.toSatisfy(
      (err: unknown) => err instanceof SpecRunnerError && err.code === ERROR_CODES.RESUME_FROM_ISSUE_UNCONFIRMED,
    );
  });
});

// ---------------------------------------------------------------------------
// TC-025: unreadable candidate branches are skipped without blocking a matching candidate
// ---------------------------------------------------------------------------

describe("TC-025: unreadable candidate branches are skipped without blocking a match", () => {
  it("TC-025: B-broken is skipped and B-good is confirmed", async () => {
    const jobId = "job-good";
    const issueNumber = 5;
    const goodBranch = "feat/good";
    const brokenBranch = "feat/broken";
    const stateJson = makeStateJson(jobId, issueNumber, goodBranch);

    const client = makeClient({
      listIssueLinkedBranches: vi.fn().mockResolvedValue([brokenBranch, goodBranch]),
    });
    const spawnFn = makeSpawnFn({
      [brokenBranch]: "fail",
      [goodBranch]: { stateJson },
    });

    const result = await resolveResumeBranchFromIssue({
      client, owner: "o", repo: "r", issueNumber, jobId, spawnFn, cwd: "/repo",
    });
    expect(result.branch).toBe(goodBranch);
  });
});

// ---------------------------------------------------------------------------
// TC-003: getIssue is never called during resolution
// ---------------------------------------------------------------------------

describe("TC-003: getIssue is never called during resolution", () => {
  it("TC-003: resolveEscalationJobId does not call getIssue", async () => {
    const getIssueSpy = vi.fn();
    const client = {
      listIssueComments: vi.fn().mockResolvedValue([makeComment("job-id", "2024-01-01T00:00:00Z")]),
      listIssueLinkedBranches: vi.fn().mockResolvedValue([]),
      getIssue: getIssueSpy,
    } as IssueResumeClient & { getIssue: typeof getIssueSpy };

    await resolveEscalationJobId({ client, owner: "o", repo: "r", issueNumber: 5 });
    expect(getIssueSpy).not.toHaveBeenCalled();
  });

  it("TC-003: resolveResumeBranchFromIssue does not call getIssue", async () => {
    const getIssueSpy = vi.fn();
    const jobId = "job-id";
    const branch = "feat/test";
    const client = {
      listIssueComments: vi.fn().mockResolvedValue([]),
      listIssueLinkedBranches: vi.fn().mockResolvedValue([branch]),
      getIssue: getIssueSpy,
    } as IssueResumeClient & { getIssue: typeof getIssueSpy };
    const stateJson = makeStateJson(jobId, 5, branch);
    const spawnFn = makeSpawnFn({ [branch]: { stateJson } });

    await resolveResumeBranchFromIssue({
      client, owner: "o", repo: "r", issueNumber: 5, jobId, spawnFn, cwd: "/repo",
    });
    expect(getIssueSpy).not.toHaveBeenCalled();
  });
});
