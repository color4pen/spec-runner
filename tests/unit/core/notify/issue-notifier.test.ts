/**
 * Unit tests for issue-notifier module.
 *
 * TC-N-001: buildMarker — produces correct HTML comment format
 * TC-N-002: buildMarker — throws on jobId containing "-->"
 * TC-N-003: buildEscalationComment — contains marker, step, reason, resume cmd
 * TC-N-004: buildEscalationComment — graceful degrade when resumePoint absent
 * TC-N-005: buildCompletionComment — contains marker and PR URL
 * TC-N-006: buildCompletionComment — graceful degrade when pullRequest absent
 * TC-N-007: notifyJobTerminal — issueNumber set + awaiting-resume → createIssueComment called
 * TC-N-008: notifyJobTerminal — issueNumber set + awaiting-archive → createIssueComment called with PR URL
 * TC-N-009: notifyJobTerminal — issueNumber absent → createIssueComment NOT called
 * TC-N-010: notifyJobTerminal — createIssueComment throws → notifyJobTerminal resolves, state unchanged
 * TC-N-011: notifyJobTerminal — status other than awaiting-resume/archive → no-op
 */
import { describe, it, expect, vi } from "vitest";
import {
  buildMarker,
  buildEscalationComment,
  buildCompletionComment,
  notifyJobTerminal,
} from "../../../../src/core/notify/issue-notifier.js";
import type { JobState } from "../../../../src/state/schema.js";
import type { GitHubClient } from "../../../../src/core/port/github-client.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-job-id-1234",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/repo/specrunner/changes/my-slug/request.md", title: "Test", type: "new-feature", slug: "my-slug" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "code-review",
    status: "running",
    branch: "feat/my-slug-12345678",
    history: [],
    error: null,
    ...overrides,
  };
}

function makeMockClient(overrides: Partial<GitHubClient> = {}): GitHubClient {
  return {
    verifyBranch: vi.fn().mockResolvedValue(true),
    getRawFile: vi.fn().mockResolvedValue(null),
    verifyPath: vi.fn().mockResolvedValue(true),
    verifyTokenScopes: vi.fn().mockResolvedValue({ status: 200, scopes: ["repo"] }),
    getRefSha: vi.fn().mockResolvedValue(null),
    listPullRequests: vi.fn().mockResolvedValue([]),
    createPullRequest: vi.fn().mockResolvedValue({ url: "", number: 0 }),
    getPullRequest: vi.fn().mockResolvedValue({ state: "OPEN" }),
    mergePullRequest: vi.fn().mockResolvedValue({ merged: true, message: "" }),
    getCheckStatus: vi.fn().mockResolvedValue({ state: "success", total: 0, failing: [], pending: [] }),
    listPullRequestFiles: vi.fn().mockResolvedValue({ files: [], truncated: false }),
    createIssueComment: vi.fn().mockResolvedValue({ id: 1, url: "https://github.com/o/r/issues/1#issuecomment-1" }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-N-001: buildMarker format
// ---------------------------------------------------------------------------

describe("TC-N-001: buildMarker — escalation", () => {
  it("produces correct HTML comment for escalation", () => {
    const marker = buildMarker("escalation", "test-job-id-1234");
    expect(marker).toBe('<!-- specrunner:notification kind="escalation" jobId="test-job-id-1234" version="1" -->');
  });
});

describe("TC-N-001: buildMarker — completed", () => {
  it("produces correct HTML comment for completed", () => {
    const marker = buildMarker("completed", "test-job-id-1234");
    expect(marker).toBe('<!-- specrunner:notification kind="completed" jobId="test-job-id-1234" version="1" -->');
  });
});

// ---------------------------------------------------------------------------
// TC-N-002: buildMarker — guard on "-->"
// ---------------------------------------------------------------------------

describe("TC-N-002: buildMarker — throws on jobId containing -->", () => {
  it("throws when jobId contains -->", () => {
    expect(() => buildMarker("escalation", 'bad-->id')).toThrow(/-->/);
  });
});

// ---------------------------------------------------------------------------
// TC-N-003: buildEscalationComment
// ---------------------------------------------------------------------------

describe("TC-N-003: buildEscalationComment — contains required elements", () => {
  it("contains marker, step, reason, and resume command", () => {
    const state = makeState({
      status: "awaiting-resume",
      resumePoint: {
        step: "code-review",
        reason: "too many iterations",
        iterationsExhausted: 3,
      },
    });
    const body = buildEscalationComment(state);

    expect(body).toContain('kind="escalation"');
    expect(body).toContain(`jobId="${state.jobId}"`);
    expect(body).toContain("code-review");
    expect(body).toContain("too many iterations");
    expect(body).toContain("specrunner job resume my-slug");
  });
});

// ---------------------------------------------------------------------------
// TC-N-004: buildEscalationComment — graceful degrade
// ---------------------------------------------------------------------------

describe("TC-N-004: buildEscalationComment — graceful degrade without resumePoint", () => {
  it("does not throw when resumePoint is absent", () => {
    const state = makeState({ status: "awaiting-resume" });
    const body = buildEscalationComment(state);

    expect(body).toContain('kind="escalation"');
    expect(body).toContain("specrunner job resume my-slug");
  });
});

describe("TC-N-004: buildEscalationComment — graceful degrade without slug", () => {
  it("uses generic resume command when slug is null", () => {
    const state = makeState({
      status: "awaiting-resume",
      request: { path: "/tmp/req.md", title: "Test", type: "new-feature", slug: null },
    });
    const body = buildEscalationComment(state);

    expect(body).toContain("specrunner job resume <slug>");
  });
});

// ---------------------------------------------------------------------------
// TC-N-005: buildCompletionComment — with PR URL
// ---------------------------------------------------------------------------

describe("TC-N-005: buildCompletionComment — contains marker and PR URL", () => {
  it("contains marker, jobId, and PR URL", () => {
    const state = makeState({
      status: "awaiting-archive",
      pullRequest: { url: "https://github.com/owner/repo/pull/99", number: 99, createdAt: "2026-01-01T00:00:00.000Z" },
    });
    const body = buildCompletionComment(state);

    expect(body).toContain('kind="completed"');
    expect(body).toContain(`jobId="${state.jobId}"`);
    expect(body).toContain("https://github.com/owner/repo/pull/99");
    expect(body).toContain("specrunner job archive my-slug");
  });
});

// ---------------------------------------------------------------------------
// TC-N-006: buildCompletionComment — graceful degrade without PR URL
// ---------------------------------------------------------------------------

describe("TC-N-006: buildCompletionComment — graceful degrade when pullRequest absent", () => {
  it("does not throw and still includes marker", () => {
    const state = makeState({ status: "awaiting-archive" });
    const body = buildCompletionComment(state);

    expect(body).toContain('kind="completed"');
    expect(body).toContain(`jobId="${state.jobId}"`);
    // Should not contain a valid PR URL but should still have archive cmd
    expect(body).toContain("specrunner job archive my-slug");
  });
});

// ---------------------------------------------------------------------------
// TC-N-007: notifyJobTerminal — awaiting-resume
// ---------------------------------------------------------------------------

describe("TC-N-007: notifyJobTerminal — issueNumber set + awaiting-resume", () => {
  it("calls createIssueComment with correct args", async () => {
    const state = makeState({
      status: "awaiting-resume",
      issueNumber: 42,
      resumePoint: {
        step: "code-review",
        reason: "iterations exhausted",
        iterationsExhausted: 3,
      },
    });
    const client = makeMockClient();
    const ctx = { githubClient: client, owner: "testowner", repo: "testrepo" };

    await notifyJobTerminal(state, ctx);

    expect(client.createIssueComment).toHaveBeenCalledOnce();
    const [owner, repo, issueNumber, body] = (client.createIssueComment as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, number, string];
    expect(owner).toBe("testowner");
    expect(repo).toBe("testrepo");
    expect(issueNumber).toBe(42);
    expect(body).toContain('kind="escalation"');
    expect(body).toContain("specrunner job resume my-slug");
    expect(body).toContain("iterations exhausted");
  });
});

// ---------------------------------------------------------------------------
// TC-N-008: notifyJobTerminal — awaiting-archive
// ---------------------------------------------------------------------------

describe("TC-N-008: notifyJobTerminal — issueNumber set + awaiting-archive", () => {
  it("calls createIssueComment with PR URL in body", async () => {
    const state = makeState({
      status: "awaiting-archive",
      issueNumber: 42,
      pullRequest: { url: "https://github.com/owner/repo/pull/99", number: 99, createdAt: "2026-01-01T00:00:00.000Z" },
    });
    const client = makeMockClient();
    const ctx = { githubClient: client, owner: "testowner", repo: "testrepo" };

    await notifyJobTerminal(state, ctx);

    expect(client.createIssueComment).toHaveBeenCalledOnce();
    const [, , issueNumber, body] = (client.createIssueComment as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, number, string];
    expect(issueNumber).toBe(42);
    expect(body).toContain('kind="completed"');
    expect(body).toContain("https://github.com/owner/repo/pull/99");
  });
});

// ---------------------------------------------------------------------------
// TC-N-009: notifyJobTerminal — issueNumber absent
// ---------------------------------------------------------------------------

describe("TC-N-009: notifyJobTerminal — issueNumber absent → no API call", () => {
  it("does not call createIssueComment when issueNumber is undefined", async () => {
    const state = makeState({ status: "awaiting-resume" });
    const client = makeMockClient();

    await notifyJobTerminal(state, { githubClient: client, owner: "o", repo: "r" });

    expect(client.createIssueComment).not.toHaveBeenCalled();
  });

  it("does not call createIssueComment when issueNumber is null", async () => {
    const state = makeState({ status: "awaiting-archive", issueNumber: null });
    const client = makeMockClient();

    await notifyJobTerminal(state, { githubClient: client, owner: "o", repo: "r" });

    expect(client.createIssueComment).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TC-N-010: notifyJobTerminal — createIssueComment throws → notifyJobTerminal resolves
// ---------------------------------------------------------------------------

describe("TC-N-010: notifyJobTerminal — createIssueComment rejects → no re-throw", () => {
  it("resolves without throwing and state.status is unchanged", async () => {
    const state = makeState({
      status: "awaiting-resume",
      issueNumber: 42,
    });
    const client = makeMockClient({
      createIssueComment: vi.fn().mockRejectedValue(new Error("network error")),
    });

    // Should not throw
    await expect(
      notifyJobTerminal(state, { githubClient: client, owner: "o", repo: "r" }),
    ).resolves.toBeUndefined();

    // State is unchanged
    expect(state.status).toBe("awaiting-resume");
  });
});

// ---------------------------------------------------------------------------
// TC-N-011: notifyJobTerminal — other status → no-op
// ---------------------------------------------------------------------------

describe("TC-N-011: notifyJobTerminal — status other than terminal → no-op", () => {
  it("does not call createIssueComment for running status", async () => {
    const state = makeState({ status: "running", issueNumber: 42 });
    const client = makeMockClient();

    await notifyJobTerminal(state, { githubClient: client, owner: "o", repo: "r" });

    expect(client.createIssueComment).not.toHaveBeenCalled();
  });

  it("does not call createIssueComment for failed status", async () => {
    const state = makeState({ status: "failed", issueNumber: 42 });
    const client = makeMockClient();

    await notifyJobTerminal(state, { githubClient: client, owner: "o", repo: "r" });

    expect(client.createIssueComment).not.toHaveBeenCalled();
  });
});
