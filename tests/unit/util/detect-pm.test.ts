/**
 * Unit tests for detect-pm utilities.
 *
 * TC-PM-001: pnpm-lock.yaml → "pnpm"
 * TC-PM-002: bun.lockb → "bun"
 * TC-PM-003: bun.lock → "bun"
 * TC-PM-004: yarn.lock → "yarn"
 * TC-PM-005: package-lock.json → "npm"
 * TC-PM-006: packageManager field in package.json → detected PM
 * TC-PM-007: no lockfile, no packageManager field → "npm" fallback
 * TC-PM-008: multiple lockfiles → first in priority order wins
 * TC-PM-009: installCommand derivation table
 * TC-PM-010: runCommand derivation table
 *
 * TC-001: cwd に lockfile がある（後方互換）→ root === cwd
 * TC-002: cwd に lockfile が無く親ディレクトリにある → parent が検出される
 * TC-003: git root を超えて探索しない（.git の上の lockfile は採用しない）
 * TC-004: git root 自身に lockfile がある → 採用する
 * TC-005: git worktree の .git ファイルでも停止する
 * TC-006: lockfile が一切無い（npm fallback）→ root === cwd
 * TC-007: 親ディレクトリの lockfile を見つけた場合の root が親ディレクトリになる
 * TC-008: lockfile 不在時の root は cwd
 * TC-014: lockfile の固定優先順序が適用される
 * TC-015: filesystem root 到達で停止する（無限ループしない）
 * TC-017: packageManager フィールドは cwd の package.json のみ参照する
 */
import { describe, it, expect } from "vitest";
import { detectPackageManager, installCommand, runCommand } from "../../../src/util/detect-pm.js";
import type { DetectPmFs } from "../../../src/util/detect-pm.js";

/** Build a DetectPmFs mock from a set of existing files and optional package.json content. */
function makeFsMock(existingFiles: string[], packageJsonContent?: object): DetectPmFs {
  const existingSet = new Set(existingFiles);
  return {
    existsSync: (p: string) => existingSet.has(p),
    readFile: async (p: string) => {
      if (p.endsWith("package.json") && packageJsonContent !== undefined) {
        return JSON.stringify(packageJsonContent);
      }
      throw new Error(`ENOENT: ${p}`);
    },
  };
}

const CWD = "/project";

// TC-PM-001
describe("TC-PM-001: pnpm-lock.yaml → pnpm", () => {
  it("detects pnpm when pnpm-lock.yaml exists", async () => {
    const fs = makeFsMock([`${CWD}/pnpm-lock.yaml`]);
    expect((await detectPackageManager(CWD, fs)).pm).toBe("pnpm");
  });
});

// TC-PM-002
describe("TC-PM-002: bun.lockb → bun", () => {
  it("detects bun when bun.lockb exists", async () => {
    const fs = makeFsMock([`${CWD}/bun.lockb`]);
    expect((await detectPackageManager(CWD, fs)).pm).toBe("bun");
  });
});

// TC-PM-003
describe("TC-PM-003: bun.lock → bun", () => {
  it("detects bun when bun.lock exists", async () => {
    const fs = makeFsMock([`${CWD}/bun.lock`]);
    expect((await detectPackageManager(CWD, fs)).pm).toBe("bun");
  });
});

// TC-PM-004
describe("TC-PM-004: yarn.lock → yarn", () => {
  it("detects yarn when yarn.lock exists", async () => {
    const fs = makeFsMock([`${CWD}/yarn.lock`]);
    expect((await detectPackageManager(CWD, fs)).pm).toBe("yarn");
  });
});

// TC-PM-005
describe("TC-PM-005: package-lock.json → npm", () => {
  it("detects npm when package-lock.json exists", async () => {
    const fs = makeFsMock([`${CWD}/package-lock.json`]);
    expect((await detectPackageManager(CWD, fs)).pm).toBe("npm");
  });
});

// TC-PM-006
describe("TC-PM-006: packageManager field in package.json", () => {
  it("detects pnpm from packageManager field when no lockfile", async () => {
    const fs = makeFsMock([], { packageManager: "pnpm@9.12.0" });
    expect((await detectPackageManager(CWD, fs)).pm).toBe("pnpm");
  });

  it("detects bun from packageManager field when no lockfile", async () => {
    const fs = makeFsMock([], { packageManager: "bun@1.0.0" });
    expect((await detectPackageManager(CWD, fs)).pm).toBe("bun");
  });

  it("detects yarn from packageManager field when no lockfile", async () => {
    const fs = makeFsMock([], { packageManager: "yarn@4.0.0" });
    expect((await detectPackageManager(CWD, fs)).pm).toBe("yarn");
  });

  it("detects npm from packageManager field when no lockfile", async () => {
    const fs = makeFsMock([], { packageManager: "npm@10.0.0" });
    expect((await detectPackageManager(CWD, fs)).pm).toBe("npm");
  });

  it("ignores unknown PM names in packageManager field and falls back to npm", async () => {
    const fs = makeFsMock([], { packageManager: "custom-pm@1.0.0" });
    expect((await detectPackageManager(CWD, fs)).pm).toBe("npm");
  });
});

// TC-PM-007
describe("TC-PM-007: no lockfile, no packageManager field → npm fallback", () => {
  it("returns npm when no lockfile and no package.json", async () => {
    const fs = makeFsMock([]);
    expect((await detectPackageManager(CWD, fs)).pm).toBe("npm");
  });

  it("returns npm when package.json has no packageManager field", async () => {
    const fs = makeFsMock([], { name: "my-pkg", scripts: {} });
    expect((await detectPackageManager(CWD, fs)).pm).toBe("npm");
  });

  it("swallows parse errors and returns npm", async () => {
    const badFs: DetectPmFs = {
      existsSync: () => false,
      readFile: async () => "{ invalid json }",
    };
    expect((await detectPackageManager(CWD, badFs)).pm).toBe("npm");
  });
});

// TC-PM-008
describe("TC-PM-008: multiple lockfiles → priority order wins", () => {
  it("pnpm-lock.yaml beats package-lock.json", async () => {
    const fs = makeFsMock([`${CWD}/pnpm-lock.yaml`, `${CWD}/package-lock.json`]);
    expect((await detectPackageManager(CWD, fs)).pm).toBe("pnpm");
  });

  it("bun.lockb beats yarn.lock", async () => {
    const fs = makeFsMock([`${CWD}/bun.lockb`, `${CWD}/yarn.lock`]);
    expect((await detectPackageManager(CWD, fs)).pm).toBe("bun");
  });

  it("pnpm-lock.yaml beats all others", async () => {
    const fs = makeFsMock([
      `${CWD}/pnpm-lock.yaml`,
      `${CWD}/bun.lockb`,
      `${CWD}/yarn.lock`,
      `${CWD}/package-lock.json`,
    ]);
    expect((await detectPackageManager(CWD, fs)).pm).toBe("pnpm");
  });
});

// TC-PM-009
describe("TC-PM-009: installCommand derivation", () => {
  it("bun → [bun, install, --frozen-lockfile]", () => {
    expect(installCommand("bun")).toEqual(["bun", "install", "--frozen-lockfile"]);
  });

  it("pnpm → [pnpm, install, --frozen-lockfile]", () => {
    expect(installCommand("pnpm")).toEqual(["pnpm", "install", "--frozen-lockfile"]);
  });

  it("yarn → [yarn, install, --frozen-lockfile]", () => {
    expect(installCommand("yarn")).toEqual(["yarn", "install", "--frozen-lockfile"]);
  });

  it("npm → [npm, ci]", () => {
    expect(installCommand("npm")).toEqual(["npm", "ci"]);
  });
});

// TC-PM-010
describe("TC-PM-010: runCommand derivation", () => {
  it("bun → [bun, run, <script>]", () => {
    expect(runCommand("bun")("build")).toEqual(["bun", "run", "build"]);
  });

  it("pnpm → [pnpm, run, <script>]", () => {
    expect(runCommand("pnpm")("test")).toEqual(["pnpm", "run", "test"]);
  });

  it("yarn → [yarn, run, <script>]", () => {
    expect(runCommand("yarn")("lint")).toEqual(["yarn", "run", "lint"]);
  });

  it("npm → [npm, run, <script>]", () => {
    expect(runCommand("npm")("typecheck")).toEqual(["npm", "run", "typecheck"]);
  });
});

// ─── Upward search tests ───────────────────────────────────────────────────

// TC-001: cwd に lockfile がある → root === cwd（後方互換）
describe("TC-001: cwd に lockfile がある → root === cwd（後方互換）", () => {
  it("cwd の pnpm-lock.yaml を見つけたとき root は cwd に等しい", async () => {
    const fs = makeFsMock([`${CWD}/pnpm-lock.yaml`]);
    const result = await detectPackageManager(CWD, fs);
    expect(result.pm).toBe("pnpm");
    expect(result.root).toBe(CWD);
  });
});

// TC-002 / TC-007: cwd に lockfile が無く親ディレクトリにある
describe("TC-002/TC-007: cwd に lockfile が無く親ディレクトリにある", () => {
  it("親ディレクトリの pnpm-lock.yaml を検出し root が親ディレクトリになる", async () => {
    const cwd = "/workspace/packages/foo";
    const parent = "/workspace";
    const fs = makeFsMock([`${parent}/pnpm-lock.yaml`]);
    const result = await detectPackageManager(cwd, fs);
    expect(result.pm).toBe("pnpm");
    expect(result.root).toBe(parent);
  });

  it("2段階上の yarn.lock を検出し root がその階層になる", async () => {
    const cwd = "/workspace/packages/bar";
    const grandparent = "/workspace";
    const fs = makeFsMock([`${grandparent}/yarn.lock`]);
    const result = await detectPackageManager(cwd, fs);
    expect(result.pm).toBe("yarn");
    expect(result.root).toBe(grandparent);
  });
});

// TC-003: git root を超えて探索しない
describe("TC-003: git root を超えて探索しない", () => {
  it(".git がある階層より上の lockfile は採用しない（git root より上はスキップ）", async () => {
    // cwd has .git, lockfile is above it
    const cwd = "/workspace/packages/foo";
    const gitDir = "/workspace/packages/foo";
    const aboveGit = "/workspace";
    const fs = makeFsMock([
      `${gitDir}/.git`,
      `${aboveGit}/pnpm-lock.yaml`,
    ]);
    const result = await detectPackageManager(cwd, fs);
    // Should NOT find pnpm-lock.yaml above .git
    expect(result.pm).toBe("npm"); // fallback
    expect(result.root).toBe(cwd);
  });

  it(".git がある中間ディレクトリで探索を停止する", async () => {
    const cwd = "/workspace/packages/foo";
    const gitBoundary = "/workspace/packages";
    const above = "/workspace";
    const fs = makeFsMock([
      `${gitBoundary}/.git`,
      `${above}/pnpm-lock.yaml`,
    ]);
    const result = await detectPackageManager(cwd, fs);
    expect(result.pm).toBe("npm");
    expect(result.root).toBe(cwd);
  });
});

// TC-004: git root 自身に lockfile がある → 採用する
describe("TC-004: git root 自身に lockfile がある → 採用する", () => {
  it("git root の pnpm-lock.yaml を採用し root がその階層になる", async () => {
    const cwd = "/workspace/packages/foo";
    const gitRoot = "/workspace";
    const fs = makeFsMock([
      `${gitRoot}/.git`,
      `${gitRoot}/pnpm-lock.yaml`,
    ]);
    const result = await detectPackageManager(cwd, fs);
    expect(result.pm).toBe("pnpm");
    expect(result.root).toBe(gitRoot);
  });
});

// TC-005: .git がファイル（gitdir pointer）でも停止する
describe("TC-005: .git がファイル（gitdir pointer）でも停止する", () => {
  it("worktree の .git ファイルが存在するとき探索を停止する", async () => {
    // In a git worktree, .git is a file (gitdir pointer). existsSync returns true for files too.
    const cwd = "/workspace/worktrees/my-feature";
    const above = "/workspace";
    const fs = makeFsMock([
      `${cwd}/.git`,   // file (gitdir pointer), existsSync treats same as dir
      `${above}/pnpm-lock.yaml`,
    ]);
    const result = await detectPackageManager(cwd, fs);
    // .git at cwd should stop search; pnpm-lock.yaml above is not adopted
    expect(result.pm).toBe("npm");
    expect(result.root).toBe(cwd);
  });
});

// TC-006 / TC-008: lockfile が一切無い（npm fallback）→ root === cwd
describe("TC-006/TC-008: lockfile が一切無い → npm fallback, root === cwd", () => {
  it("lockfile も packageManager フィールドも無いとき npm を返し root が cwd になる", async () => {
    const fs = makeFsMock([]);
    const result = await detectPackageManager(CWD, fs);
    expect(result.pm).toBe("npm");
    expect(result.root).toBe(CWD);
  });

  it("packageManager fallback 時も root は cwd になる", async () => {
    const fs = makeFsMock([], { packageManager: "pnpm@9.0.0" });
    const result = await detectPackageManager(CWD, fs);
    expect(result.pm).toBe("pnpm");
    expect(result.root).toBe(CWD);
  });
});

// TC-014: lockfile の固定優先順序が適用される（upward search でも同様）
describe("TC-014: lockfile の固定優先順序が親ディレクトリでも適用される", () => {
  it("親ディレクトリに pnpm-lock.yaml と package-lock.json が共存するとき pnpm を返す", async () => {
    const cwd = "/workspace/packages/foo";
    const parent = "/workspace";
    const fs = makeFsMock([
      `${parent}/pnpm-lock.yaml`,
      `${parent}/package-lock.json`,
    ]);
    const result = await detectPackageManager(cwd, fs);
    expect(result.pm).toBe("pnpm");
    expect(result.root).toBe(parent);
  });
});

// TC-015: filesystem root 到達で停止する（無限ループしない）
describe("TC-015: filesystem root 到達で停止する（無限ループしない）", () => {
  it(".git が一切存在しないとき filesystem root で止まり npm を返す", async () => {
    // existsSync always false → no lockfiles, no .git anywhere
    const fs = makeFsMock([]);
    // cwd is deeply nested but no lockfile/git found anywhere → reaches "/"
    const result = await detectPackageManager("/a/b/c/d/e", fs);
    expect(result.pm).toBe("npm");
    expect(result.root).toBe("/a/b/c/d/e");
  });
});

// TC-017: packageManager フィールドは cwd の package.json のみ参照する
describe("TC-017: packageManager フィールドは cwd の package.json のみ参照する", () => {
  it("cwd から git root まで lockfile が無く git root の package.json に packageManager があっても無視する", async () => {
    const cwd = "/workspace/packages/foo";
    const gitRoot = "/workspace";
    // Only /workspace/.git and /workspace/package.json exist; cwd's package.json is absent
    const fs: DetectPmFs = {
      existsSync: (p: string) => p === `${gitRoot}/.git`,
      readFile: async (p: string) => {
        if (p === `${gitRoot}/package.json`) {
          return JSON.stringify({ packageManager: "yarn@4.0.0" });
        }
        // cwd's package.json does not exist
        throw new Error(`ENOENT: ${p}`);
      },
    };
    const result = await detectPackageManager(cwd, fs);
    // git root stops upward search; git root's package.json is not read for packageManager
    expect(result.pm).toBe("npm");
    expect(result.root).toBe(cwd);
  });
});
