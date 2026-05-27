/**
 * Unit tests for CLI exit code standardization.
 *
 * TC-01: EXIT_CODE 定数の定義
 * TC-02: SpecRunnerError に exitCode プロパティが存在する
 * TC-03: CONFIG_MISSING → exit 2
 * TC-04: CONFIG_INCOMPLETE → exit 2
 * TC-05: CONFIG_INVALID → exit 2
 * TC-06: REQUEST_MD_INVALID → exit 2
 * TC-07: NOT_GIT_REPO → exit 2
 * TC-08: REMOTE_NOT_GITHUB → exit 2
 * TC-09: WORKTREE_GUARD → exit 2
 * TC-10: 未登録エラーコード → exit 1
 * TC-11: exitCode 引数で上書き可能
 */
import { describe, it, expect } from "vitest";
import { EXIT_CODE, SpecRunnerError } from "../src/errors.js";
import type { ExitCode } from "../src/errors.js";

// TC-01: EXIT_CODE 定数の定義
describe("TC-01: EXIT_CODE 定数の定義", () => {
  it("EXIT_CODE.SUCCESS === 0", () => {
    expect(EXIT_CODE.SUCCESS).toBe(0);
  });

  it("EXIT_CODE.GENERAL_ERROR === 1", () => {
    expect(EXIT_CODE.GENERAL_ERROR).toBe(1);
  });

  it("EXIT_CODE.ARG_ERROR === 2", () => {
    expect(EXIT_CODE.ARG_ERROR).toBe(2);
  });

  it("ExitCode 型は 0 | 1 | 2 に絞られる（型チェックのみ）", () => {
    const code: ExitCode = EXIT_CODE.SUCCESS;
    expect([0, 1, 2]).toContain(code);
  });
});

// TC-02: SpecRunnerError に exitCode プロパティが存在する
describe("TC-02: SpecRunnerError に exitCode プロパティが存在する", () => {
  it("exitCode プロパティが ExitCode 型（0|1|2）である", () => {
    const err = new SpecRunnerError("SOME_CODE", "hint", "message");
    expect([0, 1, 2]).toContain(err.exitCode);
  });
});

// TC-03: CONFIG_MISSING → exit 2
describe("TC-03: EXIT_CODE_MAP — CONFIG_MISSING は exit 2", () => {
  it("CONFIG_MISSING の SpecRunnerError は exitCode === 2", () => {
    const err = new SpecRunnerError("CONFIG_MISSING", "hint", "message");
    expect(err.exitCode).toBe(2);
  });
});

// TC-04: CONFIG_INCOMPLETE → exit 2
describe("TC-04: EXIT_CODE_MAP — CONFIG_INCOMPLETE は exit 2", () => {
  it("CONFIG_INCOMPLETE の SpecRunnerError は exitCode === 2", () => {
    const err = new SpecRunnerError("CONFIG_INCOMPLETE", "hint", "message");
    expect(err.exitCode).toBe(2);
  });
});

// TC-05: CONFIG_INVALID → exit 2
describe("TC-05: EXIT_CODE_MAP — CONFIG_INVALID は exit 2", () => {
  it("CONFIG_INVALID の SpecRunnerError は exitCode === 2", () => {
    const err = new SpecRunnerError("CONFIG_INVALID", "hint", "message");
    expect(err.exitCode).toBe(2);
  });
});

// TC-06: REQUEST_MD_INVALID → exit 2
describe("TC-06: EXIT_CODE_MAP — REQUEST_MD_INVALID は exit 2", () => {
  it("REQUEST_MD_INVALID の SpecRunnerError は exitCode === 2", () => {
    const err = new SpecRunnerError("REQUEST_MD_INVALID", "hint", "message");
    expect(err.exitCode).toBe(2);
  });
});

// TC-07: NOT_GIT_REPO → exit 2
describe("TC-07: EXIT_CODE_MAP — NOT_GIT_REPO は exit 2", () => {
  it("NOT_GIT_REPO の SpecRunnerError は exitCode === 2", () => {
    const err = new SpecRunnerError("NOT_GIT_REPO", "hint", "message");
    expect(err.exitCode).toBe(2);
  });
});

// TC-08: REMOTE_NOT_GITHUB → exit 2
describe("TC-08: EXIT_CODE_MAP — REMOTE_NOT_GITHUB は exit 2", () => {
  it("REMOTE_NOT_GITHUB の SpecRunnerError は exitCode === 2", () => {
    const err = new SpecRunnerError("REMOTE_NOT_GITHUB", "hint", "message");
    expect(err.exitCode).toBe(2);
  });
});

// TC-09: WORKTREE_GUARD → exit 2
describe("TC-09: EXIT_CODE_MAP — WORKTREE_GUARD は exit 2", () => {
  it("WORKTREE_GUARD の SpecRunnerError は exitCode === 2", () => {
    const err = new SpecRunnerError("WORKTREE_GUARD", "hint", "message");
    expect(err.exitCode).toBe(2);
  });
});

// TC-10: 未登録エラーコード → exit 1 (GENERAL_ERROR フォールバック)
describe("TC-10: EXIT_CODE_MAP — 未登録エラーコードはデフォルト exit 1", () => {
  it("未登録の UNKNOWN_CODE は exitCode === 1", () => {
    const err = new SpecRunnerError("UNKNOWN_CODE", "hint", "message");
    expect(err.exitCode).toBe(1);
  });
});

// TC-11: exitCode 引数で MAP より優先的に上書きできる
describe("TC-11: SpecRunnerError — exitCode 引数で上書き可能", () => {
  it("CONFIG_MISSING の exitCode を明示的に 1 に上書きできる", () => {
    const err = new SpecRunnerError("CONFIG_MISSING", "hint", "message", EXIT_CODE.GENERAL_ERROR);
    expect(err.exitCode).toBe(1);
  });

  it("UNKNOWN_CODE の exitCode を明示的に 2 に上書きできる", () => {
    const err = new SpecRunnerError("UNKNOWN_CODE", "hint", "message", EXIT_CODE.ARG_ERROR);
    expect(err.exitCode).toBe(2);
  });
});
