/**
 * Tests for lockfile-sync.ts — pure functions and gate orchestrator
 *
 * Pure function tests (depSectionsDiffer, evaluateLockfileSync):
 *   TC-016: depSectionsDiffer — dependencies に追加がある場合は true を返す
 *   TC-017: depSectionsDiffer — scripts / version のみ異なる場合は false を返す
 *   TC-018: depSectionsDiffer — key 並び替えのみの差は false を返す
 *   TC-019: depSectionsDiffer — base=null かつ HEAD に依存あり → true を返す
 *   TC-020: depSectionsDiffer — HEAD package.json が parse 不能の場合は false を返す
 *   TC-001: 依存追加 + lockfile 変更なし → failed（#935 の再現）
 *   TC-002: 依存追加 + lockfile 変更あり → passed
 *   TC-004: scripts / version のみの変更 → 非 failed
 *   TC-005: lockfile 非追跡 repo → skipped
 *
 * Gate orchestrator tests (runLockfileSyncGate):
 *   TC-003: workspace 配下 package.json の依存変更でも検出される
 *   TC-006: diff 導出不能 → skipped + 検査不能の明示
 *   TC-021: 変更集合に package.json が含まれない場合は skipped
 *   TC-022: some-package.json は basename 比較で対象外になる
 *   TC-023: HEAD package.json が fs 読取不能の場合は該当ファイルを対象外にする
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";
// These exports do not exist yet — tests are intentionally red until implementation.
import {
  depSectionsDiffer,
  evaluateLockfileSync,
  runLockfileSyncGate,
  LOCKFILE_SYNC_PHASE,
} from "../../../../src/core/verification/lockfile-sync.js";
import type { SpawnFn } from "../../../../src/core/verification/changed-lines.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
 * Build a sequential spawn mock: each call consumes the next response in the array.
 * When responses are exhausted, defaults to exit code 1 (simulate unexpected calls).
 */
function makeSequentialSpawn(
  responses: Array<{ exitCode: number; stdout: string; stderr?: string }>,
): SpawnFn {
  let idx = 0;
  return ((_cmd: string, _args: readonly string[]) => {
    const resp = responses[idx++] ?? { exitCode: 1, stdout: "", stderr: "unexpected spawn call" };
    return makeMockChild(resp.exitCode, resp.stdout, resp.stderr ?? "");
  }) as unknown as SpawnFn;
}

/** Build a spawn that always throws (simulates spawn error). */
function makeThrowingSpawn(): SpawnFn {
  return ((_cmd: string, _args: readonly string[]) => {
    const child = new EventEmitter() as NodeJS.EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      child.emit("error", new Error("spawn ENOENT"));
    });
    return child;
  }) as unknown as SpawnFn;
}

/** A simple fsLike that treats only the listed paths as existing. */
function makeFsLike(existingPaths: string[]): { existsSync(path: string): boolean } {
  const s = new Set(existingPaths);
  return { existsSync: (p: string) => s.has(p) };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lockfile-sync-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ===========================================================================
// depSectionsDiffer
// ===========================================================================

// ---------------------------------------------------------------------------
// TC-016: dependencies に追加がある場合は true を返す
// ---------------------------------------------------------------------------

describe("TC-016: depSectionsDiffer — dependencies に追加がある場合は true を返す", () => {
  it("bar の追加を依存変更として検出する", () => {
    const basePkg = { dependencies: { foo: "1.0.0" } };
    const headPkg = { dependencies: { foo: "1.0.0", bar: "2.0.0" } };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(true);
  });

  it("devDependencies への追加も検出する", () => {
    const basePkg = { devDependencies: {} };
    const headPkg = { devDependencies: { vitest: "^2.0.0" } };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(true);
  });

  it("peerDependencies への追加も検出する", () => {
    const basePkg = {};
    const headPkg = { peerDependencies: { react: "^18.0.0" } };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(true);
  });

  it("optionalDependencies への追加も検出する", () => {
    const basePkg = {};
    const headPkg = { optionalDependencies: { fsevents: "^2.0.0" } };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(true);
  });

  it("overrides への変更も検出する", () => {
    const basePkg = {};
    const headPkg = { overrides: { lodash: "^4.0.0" } };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(true);
  });

  it("resolutions への変更も検出する", () => {
    const basePkg = {};
    const headPkg = { resolutions: { "some-pkg": "1.2.3" } };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(true);
  });

  it("packageManager フィールドの変更も検出する", () => {
    const basePkg = { packageManager: "npm@9.0.0" };
    const headPkg = { packageManager: "bun@1.0.0" };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-017: scripts / version のみ異なる場合は false を返す
// ---------------------------------------------------------------------------

describe("TC-017: depSectionsDiffer — scripts / version のみ異なる場合は false を返す", () => {
  it("依存関連 7 セクションが同一で scripts・version のみ異なる → false（偽陽性にならない）", () => {
    const basePkg = {
      name: "my-pkg",
      version: "1.0.0",
      scripts: { build: "tsc" },
      dependencies: { foo: "1.0.0" },
    };
    const headPkg = {
      name: "my-pkg",
      version: "2.0.0", // changed
      scripts: { build: "tsc", test: "vitest" }, // changed
      dependencies: { foo: "1.0.0" }, // same
    };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(false);
  });

  it("どの依存関連セクションも存在しない package.json で scripts のみ変化 → false", () => {
    const basePkg = { name: "my-pkg", scripts: { build: "tsc" } };
    const headPkg = { name: "my-pkg", scripts: { build: "tsc", lint: "eslint ." } };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-018: key 並び替えのみの差は false を返す
// ---------------------------------------------------------------------------

describe("TC-018: depSectionsDiffer — key 並び替えのみの差は false を返す", () => {
  it("dependencies の key 順序のみ異なり値は同一 → false（canonical JSON 化で吸収）", () => {
    const basePkg = { dependencies: { a: "1.0.0", b: "2.0.0" } };
    const headPkg = { dependencies: { b: "2.0.0", a: "1.0.0" } };
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-019: base=null かつ HEAD に依存あり → true を返す
// ---------------------------------------------------------------------------

describe("TC-019: depSectionsDiffer — base=null かつ HEAD に依存あり → true を返す", () => {
  it("新規追加ファイル（base=null）で HEAD に dependencies あり → true（新規 workspace パッケージも検出）", () => {
    // basePkg = null は「base ブランチにこのファイルが存在しない = 新規追加」を表す
    const headPkg = { dependencies: { foo: "1.0.0" } };
    expect(depSectionsDiffer(null, headPkg)).toBe(true);
  });

  it("base=null、HEAD に devDependencies あり → true", () => {
    const headPkg = { devDependencies: { vitest: "^2.0.0" } };
    expect(depSectionsDiffer(null, headPkg)).toBe(true);
  });

  it("base=null、HEAD に依存関連セクションなし → false（新規ファイルで依存追加なし）", () => {
    const headPkg = { name: "new-pkg", scripts: { build: "tsc" } };
    expect(depSectionsDiffer(null, headPkg)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-020: HEAD package.json が parse 不能の場合は false を返す
// ---------------------------------------------------------------------------

describe("TC-020: depSectionsDiffer — HEAD package.json が parse 不能の場合は false を返す", () => {
  it("malformed headPkg → false（依存変更なし扱いとして gate を fail させない）", () => {
    const basePkg = { dependencies: { a: "1.0.0" } };
    // headPkg として malformed な値を渡す: JSON.parse が例外を投げる入力を模倣
    const headPkg = "{ this is not valid json }" as unknown;
    expect(depSectionsDiffer(basePkg, headPkg)).toBe(false);
  });
});

// ===========================================================================
// evaluateLockfileSync
// ===========================================================================

// ---------------------------------------------------------------------------
// TC-001: 依存追加 + lockfile 変更なし → failed（#935 の再現）
// ---------------------------------------------------------------------------

describe("TC-001: evaluateLockfileSync — 依存追加 + lockfile 変更なし → failed（#935 の再現）", () => {
  it("status は failed で、stdout に package manager の同期手順が含まれる", () => {
    const result = evaluateLockfileSync({
      depChangedPackageJsons: ["package.json"],
      lockfileInChangeSet: false,
      lockfileTracked: true,
      pm: "bun",
    });

    expect(result.status).toBe("failed");
    // stdout に "bun install" と "lockfile を commit" 相当の指示が含まれること
    expect(result.stdout).toContain("bun install");
    expect(result.stdout.toLowerCase()).toMatch(/commit/);
  });

  it("失敗した package.json のパスが stdout に列挙される", () => {
    const result = evaluateLockfileSync({
      depChangedPackageJsons: ["packages/foo/package.json", "package.json"],
      lockfileInChangeSet: false,
      lockfileTracked: true,
      pm: "npm",
    });

    expect(result.status).toBe("failed");
    expect(result.stdout).toContain("packages/foo/package.json");
    expect(result.stdout).toContain("package.json");
    // npm の場合は npm install か npm ci 相当
    expect(result.stdout).toMatch(/npm/);
  });
});

// ---------------------------------------------------------------------------
// TC-002: 依存追加 + lockfile 変更あり → passed
// ---------------------------------------------------------------------------

describe("TC-002: evaluateLockfileSync — 依存追加 + lockfile 変更あり → passed", () => {
  it("lockfileInChangeSet: true → status は passed（gate は fail の原因にならない）", () => {
    const result = evaluateLockfileSync({
      depChangedPackageJsons: ["package.json"],
      lockfileInChangeSet: true,
      lockfileTracked: true,
      pm: "bun",
    });

    expect(result.status).toBe("passed");
  });
});

// ---------------------------------------------------------------------------
// TC-004: scripts / version のみの変更 → 非 failed
// ---------------------------------------------------------------------------

describe("TC-004: evaluateLockfileSync — depChangedPackageJsons 空 → 非 failed（偽陽性なし）", () => {
  it("依存変更なし（scripts / version のみ変更を想定）→ skipped（failed にならない）", () => {
    // scripts / version のみ変更の場合、depSectionsDiffer は false を返すため
    // depChangedPackageJsons は空になる。evaluateLockfileSync はこの場合 skipped を返す。
    const result = evaluateLockfileSync({
      depChangedPackageJsons: [],
      lockfileInChangeSet: false,
      lockfileTracked: true,
      pm: "bun",
    });

    expect(result.status).not.toBe("failed");
    // 具体的には skipped
    expect(result.status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// TC-005: lockfile 非追跡 repo → skipped
// ---------------------------------------------------------------------------

describe("TC-005: evaluateLockfileSync — lockfile 非追跡 repo → skipped", () => {
  it("lockfileTracked: false かつ lockfileInChangeSet: false → skipped（stdout に非追跡の明示）", () => {
    const result = evaluateLockfileSync({
      depChangedPackageJsons: ["package.json"],
      lockfileInChangeSet: false,
      lockfileTracked: false,
      pm: "bun",
    });

    expect(result.status).toBe("skipped");
    // stdout に lockfile 非追跡である旨が明示される
    expect(result.stdout).toBeTruthy();
  });
});

// ===========================================================================
// runLockfileSyncGate
// ===========================================================================

// ---------------------------------------------------------------------------
// TC-003: workspace 配下 package.json の依存変更でも検出される
// ---------------------------------------------------------------------------

describe("TC-003: runLockfileSyncGate — workspace 配下 package.json の依存変更でも検出される", () => {
  it("packages/foo/package.json の依存追加 + lockfile 非含 + 追跡あり → PhaseResult.status = 'failed'", async () => {
    // Setup: create packages/foo/package.json in tmpDir (HEAD version with deps added)
    const pkgDir = path.join(tmpDir, "packages", "foo");
    await fs.mkdir(pkgDir, { recursive: true });
    const headPkg = { name: "foo", dependencies: { "new-dep": "^1.0.0" } };
    await fs.writeFile(path.join(pkgDir, "package.json"), JSON.stringify(headPkg), "utf-8");

    // base version (no dependencies)
    const basePkg = { name: "foo" };

    // Spawn: [git diff → workspace pkg, git show → base]
    const spawn = makeSequentialSpawn([
      { exitCode: 0, stdout: "packages/foo/package.json\n" },          // git diff --name-only
      { exitCode: 0, stdout: JSON.stringify(basePkg) },                  // git show main:packages/foo/package.json
    ]);

    // fsLike: bun.lock exists at repo root (lockfile tracked)
    const fsLike = makeFsLike([path.join(tmpDir, "bun.lock")]);

    const result = await runLockfileSyncGate({
      slug: "test-slug",
      cwd: tmpDir,
      baseBranch: "main",
      spawn,
      fsLike,
    });

    expect(result.phase).toBe(LOCKFILE_SYNC_PHASE);
    expect(result.status).toBe("failed");
    // stdout に同期手順が含まれる
    expect(result.stdout).toContain("bun install");
  });
});

// ---------------------------------------------------------------------------
// TC-006: diff 導出不能 → skipped + 検査不能の明示
// ---------------------------------------------------------------------------

describe("TC-006: runLockfileSyncGate — diff 導出不能 → skipped + 検査不能の明示", () => {
  it("getChangedFileList が throw → skipped で stdout に diff unavailable の旨が明示される", async () => {
    // spawn がエラーを emit → getChangedFileList が throw → skipped
    const spawn = makeThrowingSpawn();
    const fsLike = makeFsLike([]);

    const result = await runLockfileSyncGate({
      slug: "test-slug",
      cwd: "/fake-cwd",
      baseBranch: "main",
      spawn,
      fsLike,
    });

    expect(result.phase).toBe(LOCKFILE_SYNC_PHASE);
    expect(result.status).toBe("skipped");
    // stdout に検査不能（diff unavailable）である旨が明示される（黙って pass 扱いにしない）
    expect(result.stdout).toBeTruthy();
    expect(result.stdout.toLowerCase()).toMatch(/unavailable|検証できません/);
  });

  it("git diff が非 0 終了 → skipped で stdout に明示", async () => {
    const spawn = makeSequentialSpawn([
      { exitCode: 128, stdout: "", stderr: "fatal: not a git repository" },
    ]);
    const fsLike = makeFsLike([]);

    const result = await runLockfileSyncGate({
      slug: "test-slug",
      cwd: "/fake-cwd",
      baseBranch: "main",
      spawn,
      fsLike,
    });

    expect(result.phase).toBe(LOCKFILE_SYNC_PHASE);
    expect(result.status).toBe("skipped");
    expect(result.stdout).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TC-021: 変更集合に package.json が含まれない場合は skipped
// ---------------------------------------------------------------------------

describe("TC-021: runLockfileSyncGate — 変更集合に package.json が含まれない場合は skipped", () => {
  it("src/index.ts と README.md のみ変更 → skipped（package.json 変更なし）", async () => {
    const spawn = makeSequentialSpawn([
      { exitCode: 0, stdout: "src/index.ts\nREADME.md\n" },
    ]);
    const fsLike = makeFsLike([path.join(tmpDir, "bun.lock")]);

    const result = await runLockfileSyncGate({
      slug: "test-slug",
      cwd: tmpDir,
      baseBranch: "main",
      spawn,
      fsLike,
    });

    expect(result.phase).toBe(LOCKFILE_SYNC_PHASE);
    expect(result.status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// TC-022: some-package.json は basename 比較で対象外になる
// ---------------------------------------------------------------------------

describe("TC-022: runLockfileSyncGate — some-package.json は basename 比較で対象外になる", () => {
  it("lib/some-package.json のみ変更 → skipped（basename が package.json と一致しない偽陽性なし）", async () => {
    const spawn = makeSequentialSpawn([
      { exitCode: 0, stdout: "lib/some-package.json\n" },
    ]);
    const fsLike = makeFsLike([path.join(tmpDir, "bun.lock")]);

    const result = await runLockfileSyncGate({
      slug: "test-slug",
      cwd: tmpDir,
      baseBranch: "main",
      spawn,
      fsLike,
    });

    expect(result.phase).toBe(LOCKFILE_SYNC_PHASE);
    expect(result.status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// TC-023: HEAD package.json が fs 読取不能の場合は該当ファイルを対象外にする
// ---------------------------------------------------------------------------

describe("TC-023: runLockfileSyncGate — HEAD package.json が fs 読取不能の場合は該当ファイルを対象外にする", () => {
  it("変更集合に package.json があるが HEAD ディスク上に存在しない → skipped（読取不能は failed にしない）", async () => {
    // tmpDir に package.json を作成しない（HEAD 読取が失敗する状況）
    // spawn: git diff → "package.json\n", git show → base pkg (読まれる可能性あり)
    const basePkg = { name: "test-pkg" };
    const spawn = makeSequentialSpawn([
      { exitCode: 0, stdout: "package.json\n" },           // git diff --name-only
      { exitCode: 0, stdout: JSON.stringify(basePkg) },     // git show main:package.json (if called)
    ]);
    const fsLike = makeFsLike([path.join(tmpDir, "bun.lock")]);

    // tmpDir に package.json が存在しないので fs.readFile(path.join(tmpDir, "package.json")) は throw する
    const result = await runLockfileSyncGate({
      slug: "test-slug",
      cwd: tmpDir,
      baseBranch: "main",
      spawn,
      fsLike,
    });

    expect(result.phase).toBe(LOCKFILE_SYNC_PHASE);
    // HEAD が読取不能 → 当該ファイルは「依存変更なし」扱い → depChangedPackageJsons = [] → skipped
    expect(result.status).toBe("skipped");
  });
});
