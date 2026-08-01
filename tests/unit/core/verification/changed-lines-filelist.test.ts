/**
 * Tests for the new `getChangedFileList` helper added to changed-lines.ts
 *
 * TC-014: getChangedFileList が stdout を改行区切りでパースしファイル配列を返す
 * TC-015: getChangedFileList が git 非 0 終了で throw する
 */
import { describe, it, expect } from "vitest";
import { EventEmitter } from "node:events";
// This export does not exist yet — tests are intentionally red until implementation.
import { getChangedFileList } from "../../../../src/core/verification/changed-lines.js";
import type { SpawnFn } from "../../../../src/core/verification/changed-lines.js";

const CWD = "/fake-repo";

/**
 * Create a mock child process that emits stdout/stderr and closes with the given exit code.
 */
function makeMockChild(exitCode: number, stdout = "", stderr = "") {
  const child = new EventEmitter() as NodeJS.EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  setImmediate(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    child.emit("close", exitCode);
  });
  return child;
}

/**
 * Build a SpawnFn mock that always returns the given exit code and stdout.
 */
function makeSpawn(exitCode: number, stdout: string, stderr = ""): SpawnFn {
  return ((_cmd: string, _args: readonly string[]) =>
    makeMockChild(exitCode, stdout, stderr)) as unknown as SpawnFn;
}

// ---------------------------------------------------------------------------
// TC-014: getChangedFileList が stdout を改行区切りでパースしファイル配列を返す
// ---------------------------------------------------------------------------

describe("TC-014: getChangedFileList が stdout を改行区切りでパースしファイル配列を返す", () => {
  it("git diff --name-only の stdout から改行区切りファイル配列が返る（末尾空行・空文字除外）", async () => {
    // Simulates: `git diff --name-only --diff-filter=d main...HEAD`
    // stdout: "src/index.ts\npackage.json\n" (trailing newline is typical for git output)
    const spawn = makeSpawn(0, "src/index.ts\npackage.json\n");
    const result = await getChangedFileList({ cwd: CWD, baseBranch: "main", spawn });
    expect(result).toEqual(["src/index.ts", "package.json"]);
  });

  it("空の stdout → 空配列を返す（変更ファイルなし）", async () => {
    const spawn = makeSpawn(0, "");
    const result = await getChangedFileList({ cwd: CWD, baseBranch: "main", spawn });
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-015: getChangedFileList が git 非 0 終了で throw する
// ---------------------------------------------------------------------------

describe("TC-015: getChangedFileList が git 非 0 終了で throw する", () => {
  it("exit code 1 → throw する（呼び出し側が catch して skipped に倒す前提）", async () => {
    const spawn = makeSpawn(1, "", "fatal: ambiguous argument 'main...HEAD'");
    await expect(
      getChangedFileList({ cwd: CWD, baseBranch: "main", spawn }),
    ).rejects.toThrow();
  });

  it("exit code 128 → throw する（baseBranch が見つからない場合）", async () => {
    const spawn = makeSpawn(128, "", "fatal: Not a valid object name: 'main'");
    await expect(
      getChangedFileList({ cwd: CWD, baseBranch: "main", spawn }),
    ).rejects.toThrow();
  });
});
