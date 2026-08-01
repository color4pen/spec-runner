/**
 * Tests for new lockfile helper functions added to detect-pm.ts
 *
 * TC-011: `isLockfileName` が既知の lockfile 名を正しく判定する
 * TC-012: `findLockfile` が lockfile を持つディレクトリで正しく検出する
 * TC-013: `findLockfile` が lockfile を持たないディレクトリで `null` を返す
 */
import { describe, it, expect } from "vitest";
// These exports do not exist yet — tests are intentionally red until implementation.
import { isLockfileName, findLockfile } from "../../../src/util/detect-pm.js";

const CWD = "/project";

// ---------------------------------------------------------------------------
// TC-011: isLockfileName が既知の lockfile 名を正しく判定する
// ---------------------------------------------------------------------------

describe("TC-011: isLockfileName が既知の lockfile 名を正しく判定する", () => {
  it("bun.lock → true", () => {
    expect(isLockfileName("bun.lock")).toBe(true);
  });

  it("package-lock.json → true", () => {
    expect(isLockfileName("package-lock.json")).toBe(true);
  });

  it("pnpm-lock.yaml → true", () => {
    expect(isLockfileName("pnpm-lock.yaml")).toBe(true);
  });

  it("bun.lockb → true", () => {
    expect(isLockfileName("bun.lockb")).toBe(true);
  });

  it("yarn.lock → true", () => {
    expect(isLockfileName("yarn.lock")).toBe(true);
  });

  it("package.json → false（依存ファイル名そのものは lockfile ではない）", () => {
    expect(isLockfileName("package.json")).toBe(false);
  });

  it("foo.lock → false（LOCKFILE_MAP にない名前）", () => {
    expect(isLockfileName("foo.lock")).toBe(false);
  });

  it("some-package.json → false（basename 比較で偽陽性にならない）", () => {
    expect(isLockfileName("some-package.json")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-012: findLockfile が lockfile を持つディレクトリで正しく検出する
// ---------------------------------------------------------------------------

describe("TC-012: findLockfile が lockfile を持つディレクトリで正しく検出する", () => {
  it("bun.lock を持つディレクトリ → { pm: 'bun', filename: 'bun.lock', root: cwd }", () => {
    const fsLike = { existsSync: (p: string) => p === `${CWD}/bun.lock` };
    const result = findLockfile(CWD, fsLike);
    expect(result).toEqual({ pm: "bun", filename: "bun.lock", root: CWD });
  });

  it("pnpm-lock.yaml を持つディレクトリ → { pm: 'pnpm', filename: 'pnpm-lock.yaml', root: cwd }", () => {
    const fsLike = { existsSync: (p: string) => p === `${CWD}/pnpm-lock.yaml` };
    const result = findLockfile(CWD, fsLike);
    expect(result).toEqual({ pm: "pnpm", filename: "pnpm-lock.yaml", root: CWD });
  });

  it("package-lock.json を持つディレクトリ → { pm: 'npm', filename: 'package-lock.json', root: cwd }", () => {
    const fsLike = { existsSync: (p: string) => p === `${CWD}/package-lock.json` };
    const result = findLockfile(CWD, fsLike);
    expect(result).toEqual({ pm: "npm", filename: "package-lock.json", root: CWD });
  });
});

// ---------------------------------------------------------------------------
// TC-013: findLockfile が lockfile を持たないディレクトリで null を返す
// ---------------------------------------------------------------------------

describe("TC-013: findLockfile が lockfile を持たないディレクトリで null を返す", () => {
  it("existsSync が常に false → null が返る（lockfile 非追跡 repo）", () => {
    const fsLike = { existsSync: (_p: string) => false };
    const result = findLockfile(CWD, fsLike);
    expect(result).toBeNull();
  });
});
