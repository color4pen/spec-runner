/**
 * TC-003: materializeDraftAndStart が start primitive を { inboxOrigin: true, issue } で呼ぶ
 * TC-004: materializeDraftAndStart が SlugOccupiedError を伝播する
 *
 * Relocated from core/job/start-from-issue.ts → core/issue-target/start.ts.
 * The cli/run.js dynamic import is replaced by an injected startPrimitive mock.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../inbox/draft-writer.js", () => ({
  writeDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../logger/stdout.js", () => ({
  stderrWrite: vi.fn(),
}));

import { materializeDraftAndStart, startWithIssueLink, buildLinkedBranchRegistrar } from "../../issue-target/start.js";
import { writeDraft } from "../../inbox/draft-writer.js";
import { stderrWrite } from "../../../logger/stdout.js";
import { slugOccupiedError } from "../../../errors.js";
import type { GitHubClient } from "../../../kernel/github-client.js";

function makeClient(): GitHubClient {
  return {
    getIssue: vi.fn().mockResolvedValue({ number: 42, title: "T", body: "b", nodeId: "NODE_123" }),
    createLinkedBranch: vi.fn().mockResolvedValue(undefined),
    verifyBranch: vi.fn(),
    getRawFile: vi.fn(),
    verifyPath: vi.fn(),
    verifyTokenScopes: vi.fn(),
    getRefSha: vi.fn(),
    listPullRequests: vi.fn(),
    createPullRequest: vi.fn(),
    getPullRequest: vi.fn(),
    getCheckStatus: vi.fn(),
    mergePullRequest: vi.fn(),
    createIssueComment: vi.fn(),
    listPullRequestFiles: vi.fn(),
    searchOpenIssuesByLabel: vi.fn(),
    listIssueComments: vi.fn(),
    removeLabel: vi.fn(),
  } as GitHubClient;
}

const mockStartPrimitive = vi.fn().mockResolvedValue(0);

const baseOpts = {
  repoRoot: "/repo",
  slug: "my-slug",
  issueBody: "body",
  issueNumber: 42,
  owner: "owner",
  repo: "repo",
};

beforeEach(() => {
  vi.mocked(writeDraft).mockClear();
  mockStartPrimitive.mockClear();
  mockStartPrimitive.mockResolvedValue(0);
});

describe("TC-003: writeDraft precedes start", () => {
  it("TC-003: calls start primitive with inboxOrigin: true", async () => {
    const client = makeClient();
    await materializeDraftAndStart({ ...baseOpts, githubClient: client, startPrimitive: mockStartPrimitive });
    expect(mockStartPrimitive).toHaveBeenCalledWith(
      "specrunner/drafts/my-slug/request.md",
      expect.objectContaining({ inboxOrigin: true }),
    );
  });

  it("TC-003: calls start primitive with correct issueNumber", async () => {
    const client = makeClient();
    await materializeDraftAndStart({ ...baseOpts, githubClient: client, startPrimitive: mockStartPrimitive });
    expect(mockStartPrimitive).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ issue: 42 }),
    );
  });

  it("TC-003: calls start primitive with both inboxOrigin: true and issue in one call", async () => {
    const client = makeClient();
    await materializeDraftAndStart({ ...baseOpts, slug: "slug-x", issueNumber: 99, githubClient: client, startPrimitive: mockStartPrimitive });
    expect(mockStartPrimitive).toHaveBeenCalledWith(
      "specrunner/drafts/slug-x/request.md",
      expect.objectContaining({ inboxOrigin: true, issue: 99 }),
    );
  });

  it("TC-003: calls start primitive with onFeatureBranchCreated (Development link callback)", async () => {
    const client = makeClient();
    await materializeDraftAndStart({ ...baseOpts, githubClient: client, startPrimitive: mockStartPrimitive });
    expect(mockStartPrimitive).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ onFeatureBranchCreated: expect.any(Function) }),
    );
  });

  it("TC-003: calls writeDraft before start primitive", async () => {
    const order: string[] = [];
    vi.mocked(writeDraft).mockImplementationOnce(async () => { order.push("writeDraft"); });
    mockStartPrimitive.mockImplementationOnce(async () => { order.push("startPrimitive"); return 0; });
    const client = makeClient();
    await materializeDraftAndStart({ ...baseOpts, githubClient: client, startPrimitive: mockStartPrimitive });
    expect(order).toEqual(["writeDraft", "startPrimitive"]);
  });
});

describe("TC-004: occupancy error propagates", () => {
  it("TC-004: propagates SlugOccupiedError from start primitive", async () => {
    const err = slugOccupiedError("slug", { jobId: "j1", status: "running" });
    mockStartPrimitive.mockRejectedValueOnce(err);
    const client = makeClient();
    await expect(
      materializeDraftAndStart({ ...baseOpts, githubClient: client, startPrimitive: mockStartPrimitive }),
    ).rejects.toThrow(err);
  });
});

// TC-005-unit: startWithIssueLink (positional + --issue route) passes onFeatureBranchCreated to startPrimitive
describe("TC-005-unit: startWithIssueLink passes onFeatureBranchCreated to startPrimitive", () => {
  it("TC-005-unit: calls startPrimitive with onFeatureBranchCreated", async () => {
    const client = makeClient();
    await startWithIssueLink({
      repoRoot: "/repo",
      requestMdPath: "some-request.md",
      issueNumber: 42,
      githubClient: client,
      owner: "owner",
      repo: "repo",
      startPrimitive: mockStartPrimitive,
    });
    expect(mockStartPrimitive).toHaveBeenCalledWith(
      "some-request.md",
      expect.objectContaining({ onFeatureBranchCreated: expect.any(Function) }),
    );
  });

  it("TC-005-unit: does NOT pass inboxOrigin for positional route", async () => {
    const client = makeClient();
    await startWithIssueLink({
      repoRoot: "/repo",
      requestMdPath: "some-request.md",
      issueNumber: 42,
      githubClient: client,
      owner: "owner",
      repo: "repo",
      startPrimitive: mockStartPrimitive,
    });
    expect(mockStartPrimitive).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.objectContaining({ inboxOrigin: true }),
    );
  });
});

// TC-006: link callback fires with correct args
describe("TC-006: buildLinkedBranchRegistrar fires getIssue → createLinkedBranch", () => {
  it("TC-006: calls getIssue then createLinkedBranch(nodeId, branchName, baseOid)", async () => {
    const client = makeClient();
    const cb = buildLinkedBranchRegistrar({ githubClient: client, owner: "o", repo: "r", issueNumber: 42 });
    await cb("sha123", "feat/my-slug-abcdef01");
    expect(vi.mocked(client.getIssue)).toHaveBeenCalledWith("o", "r", 42);
    expect(vi.mocked(client.createLinkedBranch)).toHaveBeenCalledWith("NODE_123", "feat/my-slug-abcdef01", "sha123");
  });

  it("TC-006: createLinkedBranch throw is swallowed (best-effort)", async () => {
    const client = makeClient();
    vi.mocked(client.createLinkedBranch).mockRejectedValueOnce(new Error("GraphQL error"));
    const cb = buildLinkedBranchRegistrar({ githubClient: client, owner: "o", repo: "r", issueNumber: 42 });
    // Must not throw
    await expect(cb("sha123", "feat/my-slug-abcdef01")).resolves.toBeUndefined();
    // Warning must have been emitted
    expect(vi.mocked(stderrWrite)).toHaveBeenCalledWith(expect.stringContaining("Warning"));
  });
});
