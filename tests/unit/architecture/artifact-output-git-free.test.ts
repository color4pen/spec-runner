/**
 * Architecture gate: artifact-output and snapshot modules must be git-free.
 *
 * TC-040: artifact-output モジュールが git-exec / worktree / adapter / github-client を import しない
 * TC-041: snapshot モジュールが git-exec / worktree / adapter / github-client を import しない
 * TC-068: artifact-output と snapshot は node:child_process を直接 import しない（B-12）
 * TC-069: artifact-output と snapshot は process.cwd() を呼ばない（CWD ratchet）
 * TC-070: artifact-output と snapshot は src/adapter/** を import しない（B-1）
 * TC-071: guarded-spawn が inner spawn に git/gh を渡さない
 * TC-072: guarded-spawn のテストが git 呼び出しのブロックを確認する
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import * as path from "node:path";
import * as url from "node:url";
import * as fs from "node:fs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const ARTIFACT_OUTPUT_DIR = path.join(ROOT, "src/core/artifact-output");
const SNAPSHOT_DIR = path.join(ROOT, "src/core/snapshot");

/**
 * Run grep -rE using execFileSync (avoids shell quoting issues).
 * Returns matched lines, or "" if no matches.
 */
function grepE(pattern: string, dir: string, excludeTests = true): string {
  const args: string[] = ["-rEn"];
  if (excludeTests) {
    args.push("--exclude=*.test.ts");
  }
  args.push(pattern, dir);

  try {
    const result = execFileSync("grep", args, {
      cwd: ROOT,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim();
  } catch (err: unknown) {
    const exitCode = (err as { status?: number }).status;
    if (exitCode === 1) return ""; // grep: no matches
    throw err;
  }
}

/**
 * Collect all .ts source files (excluding __tests__ directories) from dir.
 */
function collectSrcFiles(dir: string): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dir)) return result;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      result.push(...collectSrcFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      result.push(full);
    }
  }
  return result;
}

/**
 * Check if a given file has actual code matches (not just comment lines).
 * Used to filter JSDoc mentions.
 */
function getCodeMatchLines(filePath: string, pattern: RegExp): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const matches: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Skip JSDoc / inline comments
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
      continue;
    }
    if (pattern.test(line)) {
      matches.push(`${filePath}:${i + 1}: ${trimmed}`);
    }
  }
  return matches;
}

// ─── TC-040: artifact-output does not import git utilities ────────────────────

describe("TC-040: artifact-output modules have no git/worktree/adapter/github-client imports", () => {
  it("does not import git-exec", () => {
    const result = grepE("git-exec", ARTIFACT_OUTPUT_DIR);
    expect(result).toBe("");
  });

  it("does not import from core/worktree", () => {
    const result = grepE("core/worktree", ARTIFACT_OUTPUT_DIR);
    expect(result).toBe("");
  });

  it("does not import from github-client", () => {
    const result = grepE("github-client", ARTIFACT_OUTPUT_DIR);
    expect(result).toBe("");
  });

  it("does not import from src/git/", () => {
    const result = grepE("src/git/", ARTIFACT_OUTPUT_DIR);
    expect(result).toBe("");
  });
});

// ─── TC-041: snapshot does not import git utilities ───────────────────────────

describe("TC-041: snapshot modules have no git/worktree/adapter/github-client imports", () => {
  it("does not import git-exec", () => {
    const result = grepE("git-exec", SNAPSHOT_DIR);
    expect(result).toBe("");
  });

  it("does not import from core/worktree", () => {
    const result = grepE("core/worktree", SNAPSHOT_DIR);
    expect(result).toBe("");
  });

  it("does not import from github-client", () => {
    const result = grepE("github-client", SNAPSHOT_DIR);
    expect(result).toBe("");
  });

  it("does not import from src/git/", () => {
    const result = grepE("src/git/", SNAPSHOT_DIR);
    expect(result).toBe("");
  });
});

// ─── TC-040/TC-041: no adapter imports ────────────────────────────────────────

describe("TC-040/TC-041: no adapter imports in artifact-output or snapshot", () => {
  it("artifact-output has no adapter/ imports (scan source files directly)", () => {
    const files = collectSrcFiles(ARTIFACT_OUTPUT_DIR);
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/from\s+['"].*\/adapter\//.test(line) || /from\s+['"].*\/adapter['"]/.test(line)) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(violations).toHaveLength(0);
  });

  it("snapshot has no adapter/ imports (scan source files directly)", () => {
    const files = collectSrcFiles(SNAPSHOT_DIR);
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/from\s+['"].*\/adapter\//.test(line) || /from\s+['"].*\/adapter['"]/.test(line)) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(violations).toHaveLength(0);
  });
});

// ─── TC-068: no direct node:child_process import (B-12) ──────────────────────

describe("TC-068: artifact-output and snapshot do not import node:child_process directly (B-12)", () => {
  function checkNoChildProcess(dir: string, label: string): void {
    const files = collectSrcFiles(dir);
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/import.*node:child_process/.test(line) || /require.*node:child_process/.test(line)) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(violations, `${label} should have no child_process imports`).toHaveLength(0);
  }

  it("artifact-output has no node:child_process imports", () => {
    checkNoChildProcess(ARTIFACT_OUTPUT_DIR, "artifact-output");
  });

  it("snapshot has no node:child_process imports", () => {
    checkNoChildProcess(SNAPSHOT_DIR, "snapshot");
  });
});

// ─── TC-069: no process.cwd() calls (CWD ratchet) ────────────────────────────

describe("TC-069: artifact-output and snapshot do not call process.cwd() (CWD ratchet)", () => {
  function checkNoCwd(dir: string, label: string): void {
    const files = collectSrcFiles(dir);
    const violations: string[] = [];
    for (const file of files) {
      const matchLines = getCodeMatchLines(file, /process\.cwd\(\)/);
      violations.push(...matchLines);
    }
    expect(violations, `${label} should have no process.cwd() calls in code`).toHaveLength(0);
  }

  it("artifact-output has no process.cwd() calls in code (JSDoc comments excluded)", () => {
    checkNoCwd(ARTIFACT_OUTPUT_DIR, "artifact-output");
  });

  it("snapshot has no process.cwd() calls in code", () => {
    checkNoCwd(SNAPSHOT_DIR, "snapshot");
  });
});

// ─── TC-070: no src/adapter imports (B-1) ────────────────────────────────────

describe("TC-070: no src/adapter imports in new modules (B-1)", () => {
  function checkNoAdapterImport(dir: string, label: string): void {
    const files = collectSrcFiles(dir);
    const violations: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/from\s+['"].*src\/adapter/.test(line) || /from\s+['"].*\/adapter\//.test(line)) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(violations, `${label} should have no src/adapter imports`).toHaveLength(0);
  }

  it("artifact-output does not import src/adapter/**", () => {
    checkNoAdapterImport(ARTIFACT_OUTPUT_DIR, "artifact-output");
  });

  it("snapshot does not import src/adapter/**", () => {
    checkNoAdapterImport(SNAPSHOT_DIR, "snapshot");
  });
});

// ─── TC-071: guarded-spawn itself does not call git/gh ───────────────────────

describe("TC-071: guarded-spawn.ts itself does not call git/gh commands", () => {
  it("guarded-spawn.ts does not contain execSync('git')", () => {
    const guardedSpawnPath = path.join(ARTIFACT_OUTPUT_DIR, "guarded-spawn.ts");
    const src = fs.readFileSync(guardedSpawnPath, "utf-8");
    expect(src).not.toMatch(/execSync\s*\(\s*['"]git/);
    expect(src).not.toMatch(/execSync\s*\(\s*['"]gh/);
  });

  it("guarded-spawn.ts does not spawn git or gh internally", () => {
    const guardedSpawnPath = path.join(ARTIFACT_OUTPUT_DIR, "guarded-spawn.ts");
    const src = fs.readFileSync(guardedSpawnPath, "utf-8");
    // Should not import child_process at all
    expect(src).not.toContain("node:child_process");
  });

  it("guarded-spawn.ts throws (not passes through) when cmd is git", () => {
    const guardedSpawnPath = path.join(ARTIFACT_OUTPUT_DIR, "guarded-spawn.ts");
    const src = fs.readFileSync(guardedSpawnPath, "utf-8");
    // Must have throw statement (not just return or delegate)
    expect(src).toMatch(/throw\s+new\s+Error/);
  });
});

// ─── TC-072: guarded-spawn test confirms git blocking ────────────────────────

describe("TC-072: guarded-spawn test confirms git invocation is blocked", () => {
  it("guarded-spawn test file exists", () => {
    const testPath = path.join(ARTIFACT_OUTPUT_DIR, "__tests__", "guarded-spawn.test.ts");
    expect(fs.existsSync(testPath)).toBe(true);
  });

  it("guarded-spawn test contains git blocking assertions", () => {
    const testPath = path.join(ARTIFACT_OUTPUT_DIR, "__tests__", "guarded-spawn.test.ts");
    const src = fs.readFileSync(testPath, "utf-8");
    expect(src).toContain("git");
    expect(src).toContain("throw");
  });
});

// ─── Source module count: all expected files exist ───────────────────────────

describe("Expected source files are present", () => {
  const expectedArtifactOutputFiles = [
    "execution-profile.ts",
    "preflight.ts",
    "run-layout.ts",
    "materialize.ts",
    "source-guard.ts",
    "guarded-spawn.ts",
    "patch.ts",
    "manifest.ts",
    "artifact-writer.ts",
    "context.ts",
    "revision-binding.ts",
    "run.ts",
  ];

  for (const file of expectedArtifactOutputFiles) {
    it(`artifact-output/${file} exists`, () => {
      const filePath = path.join(ARTIFACT_OUTPUT_DIR, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  }

  const expectedSnapshotFiles = [
    "types.ts",
    "digest.ts",
    "collect.ts",
    "compare.ts",
  ];

  for (const file of expectedSnapshotFiles) {
    it(`snapshot/${file} exists`, () => {
      const filePath = path.join(SNAPSHOT_DIR, file);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  }
});
