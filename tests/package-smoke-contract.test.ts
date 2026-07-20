/**
 * Integration tests for the package smoke script contracts.
 *
 * These tests verify structural and behavioral properties of
 * scripts/smoke/package-smoke.sh that can be checked quickly
 * (without running a full npm pack → install → CLI cycle).
 *
 * TC-012: smoke script exits with explicit error when dist/specrunner.js is absent
 * TC-006 (content): smoke script does not invoke bun or reference src/
 *
 * NOTE: TC-001 through TC-005, TC-007, TC-008 are tested by the smoke script
 * itself (scripts/smoke/package-smoke.sh), which is the primary integration
 * test artifact for those cases. Run it after `bun run build` with:
 *   bash scripts/smoke/package-smoke.sh
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../");
const SMOKE_SCRIPT = path.join(REPO_ROOT, "scripts", "smoke", "package-smoke.sh");

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "smoke-unit-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-012: smoke script exits non-zero with dist-missing error
// Source: tasks.md > T-01 / design.md > D2（前提チェック）
//
// GIVEN dist/specrunner.js does not exist (SMOKE_REPO_ROOT points to a dir without dist/)
// WHEN  bash scripts/smoke/package-smoke.sh is executed
// THEN  script exits non-zero and outputs a human-readable error mentioning dist and build
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-012: smoke script exits non-zero with dist-absent error when dist/specrunner.js is absent", () => {
  it("exits with non-zero exit code when pointed at a directory without dist/specrunner.js", () => {
    // SMOKE_REPO_ROOT override lets us control where the script looks for dist
    // without touching the real repo or running npm pack.
    const result = spawnSync("bash", [SMOKE_SCRIPT], {
      env: {
        ...process.env,
        SMOKE_REPO_ROOT: tmpDir, // tmpDir has no dist/
      },
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 15_000,
    });

    // Must exit non-zero
    expect(result.status).not.toBe(0);
  });

  it("outputs a human-readable error mentioning 'dist' and 'build' when dist is absent", () => {
    const result = spawnSync("bash", [SMOKE_SCRIPT], {
      env: {
        ...process.env,
        SMOKE_REPO_ROOT: tmpDir,
      },
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 15_000,
    });

    // Error message should mention both 'dist' and 'build' so the user knows what to do
    const output = (result.stdout ?? "") + (result.stderr ?? "");
    expect(output.toLowerCase()).toMatch(/dist/);
    expect(output.toLowerCase()).toMatch(/build/);
  });

  it("exits quickly without invoking npm pack when dist is absent", () => {
    // Verify the script performs the pre-check before doing any npm operations.
    // npm pack takes multiple seconds; a fast exit means the pre-check fired first.
    const startMs = Date.now();
    spawnSync("bash", [SMOKE_SCRIPT], {
      env: {
        ...process.env,
        SMOKE_REPO_ROOT: tmpDir,
      },
      cwd: REPO_ROOT,
      encoding: "utf8",
      timeout: 15_000,
    });
    const elapsedMs = Date.now() - startMs;
    expect(elapsedMs).toBeLessThan(5_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-012 (structural): smoke script file exists and is executable
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-012 (structural): scripts/smoke/package-smoke.sh exists and is executable", () => {
  it("scripts/smoke/package-smoke.sh exists as a regular file", async () => {
    const stat = await fs.stat(SMOKE_SCRIPT);
    expect(stat.isFile()).toBe(true);
  });

  it("scripts/smoke/package-smoke.sh has execute permission", async () => {
    await expect(fs.access(SMOKE_SCRIPT, fsConstants.X_OK)).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-006 (content): smoke script must not invoke bun or reference src/
// Source: TC-006 / Scenario: the smoke does not reference bun or repository sources
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-006 (content): smoke script must not invoke bun or reference src/", () => {
  it("does not invoke bun as a command (excluding quoted user-facing text and comments)", async () => {
    const content = await fs.readFile(SMOKE_SCRIPT, "utf8");
    const lines = content.split("\n");
    const invocationLines = lines.filter((line) => {
      const trimmed = line.trim();
      // Skip comments
      if (trimmed.startsWith("#")) return false;
      // Strip quoted strings (single and double) to avoid flagging echo messages that
      // mention 'bun' as human-readable text (e.g. "Run 'bun run build' first...")
      const withoutQuoted = trimmed
        .replace(/'[^']*'/g, "''")
        .replace(/"[^"]*"/g, '""');
      // Detect bun as an actual command invocation:
      // - at the start of a statement: `bun <args>`
      // - after $( or | or ; or &&: `$(bun ...)`
      return /(?:^|[$|;&(]\s*)\bbun\b/.test(withoutQuoted);
    });
    expect(invocationLines).toHaveLength(0);
  });

  it("does not reference the repository src/ directory in non-comment lines", async () => {
    const content = await fs.readFile(SMOKE_SCRIPT, "utf8");
    const lines = content.split("\n");
    const srcRefLines = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) return false;
      // Flag path-like references to src/ (but not the string "src" inside variable names)
      return /[/.]src\//.test(trimmed);
    });
    expect(srcRefLines).toHaveLength(0);
  });
});
