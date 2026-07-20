/**
 * TC-001: git repo 内で origin が未設定のとき hint が git remote add を示す
 * TC-002: 真の非 git repo 経路は変わらない
 * TC-017: originNotConfiguredError の error code と exit code が現行と同一
 */
import { describe, it, expect } from "vitest";
import { notGitRepoError } from "../../../src/errors.js";

// TC-017: originNotConfiguredError factory の code / exit code 検証
// 実装後に originNotConfiguredError が src/errors.ts に追加される。
// 実装前: インポートが undefined になり呼び出しが TypeError で失敗 → RED
describe("TC-017: originNotConfiguredError code and exit code", () => {
  it("originNotConfiguredError has code NOT_GIT_REPO", async () => {
    // Dynamic import to get the up-to-date module state
    const errors = await import("../../../src/errors.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (errors as any).originNotConfiguredError;
    expect(fn, "originNotConfiguredError must be exported from src/errors.ts").toBeDefined();
    const err = fn();
    expect(err.code).toBe("NOT_GIT_REPO");
  });

  it("originNotConfiguredError has exit code 2 (ARG_ERROR)", async () => {
    const errors = await import("../../../src/errors.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (errors as any).originNotConfiguredError;
    expect(fn, "originNotConfiguredError must be exported from src/errors.ts").toBeDefined();
    const err = fn();
    expect(err.exitCode).toBe(2);
  });

  it("originNotConfiguredError has same code and exit code as notGitRepoError", async () => {
    const errors = await import("../../../src/errors.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (errors as any).originNotConfiguredError;
    expect(fn, "originNotConfiguredError must be exported from src/errors.ts").toBeDefined();
    const err = fn();
    const notGitErr = notGitRepoError();
    expect(err.code).toBe(notGitErr.code);
    expect(err.exitCode).toBe(notGitErr.exitCode);
  });
});

// TC-001: originNotConfiguredError の hint が git remote add を含み cd into... を含まない
describe("TC-001: originNotConfiguredError hint prescription", () => {
  it("hint contains 'git remote add'", async () => {
    const errors = await import("../../../src/errors.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (errors as any).originNotConfiguredError;
    expect(fn, "originNotConfiguredError must be exported from src/errors.ts").toBeDefined();
    const err = fn();
    expect(err.hint).toContain("git remote add");
  });

  it("hint does not contain 'cd into a git repository'", async () => {
    const errors = await import("../../../src/errors.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fn = (errors as any).originNotConfiguredError;
    expect(fn, "originNotConfiguredError must be exported from src/errors.ts").toBeDefined();
    const err = fn();
    expect(err.hint).not.toContain("cd into a git repository");
  });

  // Integration: getOriginInfo in a real git repo without origin throws originNotConfiguredError hint
  it("getOriginInfo in git repo without origin throws hint with git remote add", async () => {
    const os = await import("node:os");
    const path = await import("node:path");
    const fs = await import("node:fs/promises");
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileP = promisify(execFile);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-no-origin-"));
    try {
      await execFileP("git", ["init"], { cwd: tmpDir });
      // Do NOT add any remote — simulate git repo without origin

      const { getOriginInfo } = await import("../../../src/git/remote.js");
      let caughtErr: unknown;
      try {
        await getOriginInfo(tmpDir);
      } catch (err) {
        caughtErr = err;
      }
      expect(caughtErr, "getOriginInfo should throw when origin is missing").toBeDefined();
      const e = caughtErr as { code?: string; hint?: string };
      expect(e.code).toBe("NOT_GIT_REPO");
      expect(e.hint).toContain("git remote add");
      expect(e.hint).not.toContain("cd into a git repository");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

// TC-002: notGitRepoError（真の非 git repo 経路）は変わらない
describe("TC-002: notGitRepoError (non-git-repo path) unchanged", () => {
  it("hint contains 'cd into a git repository'", () => {
    const err = notGitRepoError();
    expect(err.hint).toContain("cd into a git repository");
  });

  it("code is NOT_GIT_REPO", () => {
    const err = notGitRepoError();
    expect(err.code).toBe("NOT_GIT_REPO");
  });

  it("exit code is 2", () => {
    const err = notGitRepoError();
    expect(err.exitCode).toBe(2);
  });
});
