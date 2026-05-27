/**
 * Unit tests for atomicWriteJson (src/util/atomic-write.ts).
 *
 * TC-01: mode 未指定時に 0o600 が適用される
 * TC-02: options.mode 省略時（空オブジェクト渡し）に 0o600 が適用される
 * TC-03: 明示 mode が優先される（デフォルト 0o600 に上書きされない）
 * TC-06: tmp file に O_EXCL (`wx`) フラグが使われる
 * TC-07: tmp file が既存の場合 EEXIST で失敗しクリーンアップされる
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fsSync from "node:fs";
import * as fsPromises from "node:fs/promises";

// vi.mock は Vitest によってファイル先頭にホイストされる。
// atomic-write.ts が node:fs/promises をインポートする前に mock が適用される。
vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return {
    ...actual,
    mkdir: vi.fn(actual.mkdir),
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
    chmod: vi.fn(actual.chmod),
    unlink: vi.fn(actual.unlink),
  };
});

import { atomicWriteJson } from "../../../src/util/atomic-write.js";

let tempDir: string;

beforeEach(async () => {
  // vi.resetAllMocks() でコール履歴と一時実装をリセット
  vi.resetAllMocks();
  // resetAllMocks で実装が undefined になるため call-through を再設定
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  vi.mocked(fsPromises.mkdir).mockImplementation(actual.mkdir as typeof fsPromises.mkdir);
  vi.mocked(fsPromises.writeFile).mockImplementation(
    actual.writeFile as typeof fsPromises.writeFile,
  );
  vi.mocked(fsPromises.rename).mockImplementation(actual.rename as typeof fsPromises.rename);
  vi.mocked(fsPromises.chmod).mockImplementation(actual.chmod as typeof fsPromises.chmod);
  vi.mocked(fsPromises.unlink).mockImplementation(actual.unlink as typeof fsPromises.unlink);

  // node:fs (sync) は mock していないので mkdtempSync は確実に実際の実装
  tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "atomic-write-test-"));
});

afterEach(() => {
  fsSync.rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// TC-01: mode 未指定時に 0o600 が適用される
// ---------------------------------------------------------------------------

describe("TC-01: atomicWriteJson — mode 未指定時に 0o600 が適用される", () => {
  it("options なし（undefined）で呼び出すと最終ファイルのパーミッションが 0o600", async () => {
    const filePath = path.join(tempDir, "output.json");
    await atomicWriteJson(filePath, { hello: "world" });

    const stat = fsSync.statSync(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

// ---------------------------------------------------------------------------
// TC-02: options.mode 省略時（空オブジェクト渡し）に 0o600 が適用される
// ---------------------------------------------------------------------------

describe("TC-02: atomicWriteJson — options.mode 省略時（{}）に 0o600 が適用される", () => {
  it("mode を含まない空オブジェクトを渡すと最終ファイルのパーミッションが 0o600", async () => {
    const filePath = path.join(tempDir, "output.json");
    await atomicWriteJson(filePath, { hello: "world" }, {});

    const stat = fsSync.statSync(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});

// ---------------------------------------------------------------------------
// TC-03: 明示 mode が優先される（デフォルト 0o600 に上書きされない）
// ---------------------------------------------------------------------------

describe("TC-03: atomicWriteJson — 明示 mode が優先される", () => {
  it("mode: 0o644 を明示指定すると最終ファイルのパーミッションが 0o644（デフォルト 0o600 に上書きされない）", async () => {
    const filePath = path.join(tempDir, "output.json");
    await atomicWriteJson(filePath, { hello: "world" }, { mode: 0o644 });

    const stat = fsSync.statSync(filePath);
    expect(stat.mode & 0o777).toBe(0o644);
  });
});

// ---------------------------------------------------------------------------
// TC-06: tmp file に O_EXCL (`wx`) フラグが使われる
// ---------------------------------------------------------------------------

describe("TC-06: atomicWriteJson — tmp file に O_EXCL (`wx`) フラグが使われる", () => {
  it("fs.writeFile が { flag: 'wx', mode: 0o600 } で呼ばれる", async () => {
    const filePath = path.join(tempDir, "output.json");
    await atomicWriteJson(filePath, { hello: "world" });

    expect(vi.mocked(fsPromises.writeFile)).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp\.[a-f0-9]+$/),
      expect.any(String),
      expect.objectContaining({ flag: "wx", mode: 0o600 }),
    );
  });

  it("明示 mode: 0o644 でも flag は 'wx' が使われる", async () => {
    const filePath = path.join(tempDir, "output.json");
    await atomicWriteJson(filePath, { hello: "world" }, { mode: 0o644 });

    expect(vi.mocked(fsPromises.writeFile)).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp\.[a-f0-9]+$/),
      expect.any(String),
      expect.objectContaining({ flag: "wx", mode: 0o644 }),
    );
  });
});

// ---------------------------------------------------------------------------
// TC-07: tmp file が既存の場合 EEXIST で失敗しクリーンアップされる
// ---------------------------------------------------------------------------

describe("TC-07: atomicWriteJson — EEXIST で失敗しクリーンアップされる", () => {
  it("writeFile が EEXIST を返すとエラーが伝播し unlink が試みられる", async () => {
    const filePath = path.join(tempDir, "output.json");

    const eexist = Object.assign(new Error("EEXIST: file already exists"), { code: "EEXIST" });
    vi.mocked(fsPromises.writeFile).mockRejectedValueOnce(eexist);

    await expect(atomicWriteJson(filePath, { hello: "world" })).rejects.toThrow("EEXIST");

    // best-effort クリーンアップとして unlink が tmp file に対して呼ばれる
    expect(vi.mocked(fsPromises.unlink)).toHaveBeenCalledOnce();
    expect(vi.mocked(fsPromises.unlink)).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp\.[a-f0-9]+$/),
    );
  });
});
