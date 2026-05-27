/**
 * Error handling unit tests for verbose log functions.
 *
 * TC-05-01: initVerboseLog — ディレクトリ作成失敗時は stderr 警告 + 例外非伝播 + logFd null
 * TC-05-02: logVerbose — 書き込み失敗時は例外非伝播 + logFd null + 以降 no-op
 */
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// vi.mock は Vitest によってファイル先頭にホイストされる。
// stdout.ts が node:fs をインポートする前に mock が適用されるため、
// stdout.ts 内の mkdirSync / writeSync は vi.fn() ラッパーになる。
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    mkdirSync: vi.fn(actual.mkdirSync),
    writeSync: vi.fn(actual.writeSync),
  };
});

import * as os from "node:os";
import * as path from "node:path";
import * as nodeFs from "node:fs";
import * as fsPromises from "node:fs/promises";
import {
  setLogLevel,
  initVerboseLog,
  logVerbose,
  closeVerboseLog,
  getVerboseLogFilePath,
} from "../../../src/logger/stdout.js";

let tempDir: string;

beforeEach(async () => {
  // vi.resetAllMocks() でコール履歴と一時実装キューをリセット
  vi.resetAllMocks();
  // call-through 動作を再設定（resetAllMocks で実装が undefined になるため）
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  vi.mocked(nodeFs.mkdirSync).mockImplementation(actual.mkdirSync as typeof nodeFs.mkdirSync);
  vi.mocked(nodeFs.writeSync).mockImplementation(actual.writeSync as typeof nodeFs.writeSync);

  tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "specrunner-verbose-err-test-"));
  setLogLevel("default");
  closeVerboseLog();
});

afterEach(async () => {
  closeVerboseLog();
  setLogLevel("default");
  await fsPromises.rm(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-05-01: initVerboseLog — ディレクトリ作成失敗
// ---------------------------------------------------------------------------

describe("TC-05-01: initVerboseLog — ディレクトリ作成失敗", () => {
  it("stderr に警告が出力される AND logFd が null のまま AND 例外が伝播しない", () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

    // mkdirSync を失敗させる（EACCES をシミュレート）
    vi.mocked(nodeFs.mkdirSync).mockImplementationOnce(() => {
      const err = Object.assign(new Error("EACCES: permission denied, mkdir '/no-access/path'"), {
        code: "EACCES",
      });
      throw err;
    });

    setLogLevel("verbose");

    // 例外が伝播しないことを確認
    expect(() => initVerboseLog(tempDir, "test-job-mkdir-fail")).not.toThrow();

    // stderr に警告が出力されていることを確認
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining("Warning: Failed to initialize verbose log"),
    );

    // logFd が null のまま（getVerboseLogFilePath が null を返す）
    expect(getVerboseLogFilePath()).toBeNull();

    // 以降の logVerbose も no-op で例外が発生しない
    expect(() => logVerbose("step", "should not be written")).not.toThrow();

    stderrSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// TC-05-02: logVerbose — 書き込み失敗
// ---------------------------------------------------------------------------

describe("TC-05-02: logVerbose — 書き込み失敗", () => {
  it("例外が発生しない AND logFd が null になる AND 以降の logVerbose が no-op になる", () => {
    setLogLevel("verbose");
    initVerboseLog(tempDir, "test-job-write-fail");

    // initVerboseLog が成功したことを確認（logFd が設定されている）
    expect(getVerboseLogFilePath()).not.toBeNull();

    // writeSync を 1 回だけ失敗させる（ENOSPC をシミュレート）
    vi.mocked(nodeFs.writeSync).mockImplementationOnce(() => {
      const err = Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
      throw err;
    });

    // logVerbose の呼び出しで例外が伝播しないことを確認
    expect(() => logVerbose("step", "write will fail")).not.toThrow();

    // 失敗後は logFd = null → writeSync はこれ以上呼ばれない
    const callCountAfterFail = vi.mocked(nodeFs.writeSync).mock.calls.length;
    expect(callCountAfterFail).toBe(1); // 失敗した 1 回のみ

    // 以降の logVerbose も no-op で例外が発生しない
    expect(() => logVerbose("step", "should be no-op after failure")).not.toThrow();

    // 2 回目の logVerbose では writeSync が呼ばれていない（logFd = null のため）
    expect(vi.mocked(nodeFs.writeSync).mock.calls.length).toBe(1); // 増えていない
  });
});
