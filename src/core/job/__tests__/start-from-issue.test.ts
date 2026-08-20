/**
 * TC-001: materializeDraftAndStart が runRunCore を { inboxOrigin: true, issue } で呼ぶ
 *
 * If inboxOrigin: true is removed from start-from-issue.ts, these tests turn red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../inbox/draft-writer.js", () => ({
  writeDraft: vi.fn().mockResolvedValue(undefined),
}));

// vitest intercepts dynamic imports too; path is relative to this test file
vi.mock("../../../cli/run.js", () => ({
  runRunCore: vi.fn().mockResolvedValue(0),
  runRun: vi.fn().mockResolvedValue(undefined),
}));

import { materializeDraftAndStart } from "../start-from-issue.js";
import { writeDraft } from "../../inbox/draft-writer.js";
import { runRunCore } from "../../../cli/run.js";
import { slugOccupiedError } from "../../../errors.js";

beforeEach(() => {
  vi.mocked(writeDraft).mockClear();
  vi.mocked(runRunCore).mockClear();
  vi.mocked(runRunCore).mockResolvedValue(0);
});

describe("TC-001: materializeDraftAndStart → runRunCore({ inboxOrigin: true })", () => {
  it("TC-001: calls runRunCore with inboxOrigin: true", async () => {
    await materializeDraftAndStart({
      repoRoot: "/repo",
      slug: "my-slug",
      issueBody: "body",
      issueNumber: 42,
    });
    expect(vi.mocked(runRunCore)).toHaveBeenCalledWith(
      "specrunner/drafts/my-slug/request.md",
      expect.objectContaining({ inboxOrigin: true }),
    );
  });

  it("TC-001: calls runRunCore with the correct issueNumber", async () => {
    await materializeDraftAndStart({
      repoRoot: "/repo",
      slug: "my-slug",
      issueBody: "body",
      issueNumber: 42,
    });
    expect(vi.mocked(runRunCore)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ issue: 42 }),
    );
  });

  it("TC-001: calls runRunCore with both inboxOrigin: true and correct issue in one call", async () => {
    await materializeDraftAndStart({
      repoRoot: "/repo",
      slug: "slug-x",
      issueBody: "body",
      issueNumber: 99,
    });
    expect(vi.mocked(runRunCore)).toHaveBeenCalledWith(
      "specrunner/drafts/slug-x/request.md",
      expect.objectContaining({ inboxOrigin: true, issue: 99 }),
    );
  });

  it("TC-001: calls writeDraft before runRunCore", async () => {
    const order: string[] = [];
    vi.mocked(writeDraft).mockImplementationOnce(async () => { order.push("writeDraft"); });
    vi.mocked(runRunCore).mockImplementationOnce(async () => { order.push("runRunCore"); return 0; });

    await materializeDraftAndStart({
      repoRoot: "/repo",
      slug: "slug",
      issueBody: "body",
      issueNumber: 1,
    });
    expect(order).toEqual(["writeDraft", "runRunCore"]);
  });

  it("TC-001: propagates SlugOccupiedError from runRunCore (existing path)", async () => {
    const err = slugOccupiedError("slug", { jobId: "j1", status: "running" });
    vi.mocked(runRunCore).mockRejectedValueOnce(err);
    await expect(
      materializeDraftAndStart({ repoRoot: "/r", slug: "slug", issueBody: "b", issueNumber: 1 }),
    ).rejects.toThrow(err);
  });
});
