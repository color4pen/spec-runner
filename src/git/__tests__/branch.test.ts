/**
 * Unit tests for getCurrentBranch
 *
 * TC-013: getCurrentBranch が通常 branch で branch 名を返す
 * TC-014: getCurrentBranch が detached HEAD で null を返す
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../../util/git-exec.js", () => ({
  gitExec: vi.fn(),
  defaultSpawnFn: vi.fn(),
}));

import { getCurrentBranch } from "../branch.js";
import { gitExec } from "../../util/git-exec.js";

describe("TC-013: getCurrentBranch が通常 branch で branch 名を返す", () => {
  it("TC-013: returns branch name when symbolic-ref succeeds", async () => {
    vi.mocked(gitExec).mockResolvedValueOnce("main");
    const result = await getCurrentBranch("/fake/repo");
    expect(result).toBe("main");
  });

  it("TC-013: passes correct git args to gitExec", async () => {
    vi.mocked(gitExec).mockResolvedValueOnce("feature/my-branch");
    await getCurrentBranch("/my/repo");
    expect(vi.mocked(gitExec)).toHaveBeenCalledWith(
      expect.anything(),
      "/my/repo",
      ["symbolic-ref", "--short", "-q", "HEAD"],
    );
  });

  it("TC-013: trims the returned branch name", async () => {
    vi.mocked(gitExec).mockResolvedValueOnce("develop");
    expect(await getCurrentBranch("/any")).toBe("develop");
  });
});

describe("TC-014: getCurrentBranch が detached HEAD で null を返す", () => {
  it("TC-014: returns null when gitExec returns null (non-zero exit / detached HEAD)", async () => {
    vi.mocked(gitExec).mockResolvedValueOnce(null);
    const result = await getCurrentBranch("/fake/repo");
    expect(result).toBeNull();
  });

  it("TC-014: returns null when gitExec returns empty string", async () => {
    vi.mocked(gitExec).mockResolvedValueOnce("");
    const result = await getCurrentBranch("/fake/repo");
    expect(result).toBeNull();
  });
});
