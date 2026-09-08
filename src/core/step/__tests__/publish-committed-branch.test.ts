import { describe, expect, it, vi } from "vitest";
import { publishCommittedBranch } from "../commit-push.js";

const result = (exitCode: number, stdout = "", stderr = "") => ({ exitCode, stdout, stderr });

describe("publishCommittedBranch", () => {
  it("TC-028 returns already-synchronized without push", async () => {
    const spawn = vi.fn()
      .mockResolvedValueOnce(result(0, "remote-tip\n"))
      .mockResolvedValueOnce(result(0, ""));
    await expect(publishCommittedBranch({ cwd: "/repo", branch: "change/x", ledger: [], spawnFn: spawn }))
      .resolves.toEqual({ kind: "already-synchronized" });
    expect(spawn.mock.calls.some((call) => call[1][0] === "push")).toBe(false);
  });

  it("TC-035 creates a missing remote feature ref from ledgered commits", async () => {
    const spawn = vi.fn()
      .mockResolvedValueOnce(result(1))
      .mockResolvedValueOnce(result(0, "job-2\njob-1\n"))
      .mockResolvedValueOnce(result(0));
    await expect(publishCommittedBranch({ cwd: "/repo", branch: "change/x", ledger: ["job-1", "job-2"], spawnFn: spawn }))
      .resolves.toEqual({ kind: "published" });
    expect(spawn.mock.calls[1]?.[1]).toEqual(["rev-list", "HEAD", "--not", "--remotes=origin"]);
  });

  it("TC-005 rejects an outgoing commit outside the ledger", async () => {
    const spawn = vi.fn()
      .mockResolvedValueOnce(result(0, "remote-tip\n"))
      .mockResolvedValueOnce(result(0, "unknown\n"));
    const publication = await publishCommittedBranch({ cwd: "/repo", branch: "change/x", ledger: [], spawnFn: spawn });
    expect(publication).toMatchObject({ kind: "failure", phase: "egress" });
    expect(spawn.mock.calls.some((call) => call[1][0] === "push")).toBe(false);
  });

  it("TC-003 retries an unchanged unpublished range", async () => {
    const spawn = vi.fn()
      .mockResolvedValueOnce(result(0, "remote-tip\n"))
      .mockResolvedValueOnce(result(0, "job-1\n"))
      .mockResolvedValueOnce(result(1, "", "secret remote error"))
      .mockResolvedValueOnce(result(0));
    await expect(publishCommittedBranch({ cwd: "/repo", branch: "change/x", ledger: ["job-1"], spawnFn: spawn }))
      .resolves.toEqual({ kind: "published" });
    expect(spawn.mock.calls.filter((call) => call[1][0] === "push")).toHaveLength(2);
  });
});
