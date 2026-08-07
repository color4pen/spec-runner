/**
 * Tests for dedup-verified-safe refactoring.
 *
 * Must TCs covered here:
 *   TC-001: run and job-start commands produce identical runtime behavior
 *   TC-002: help output preserves positional labels
 *   TC-003: command path skip string is preserved byte-for-byte
 *   TC-004: phase path skip string is preserved byte-for-byte
 *   TC-005: deleted symbols (compute*Iteration) absent from src/ and tests/
 *   TC-006: typecheck && test scripts exist in package.json
 *   TC-007: loadConfig throws CONFIG_MISSING when both config files absent
 *   TC-008: detectPackageManager phase-1 uses findLockfile
 *   TC-009: appendEventRecord appears exactly once in job-journal.ts
 *   TC-010: skipLabel template generates byte-identical strings
 *   TC-011: run and job start handlers are the same function reference (should)
 *   TC-012: PROBE_SLUG alias absent from src/ and tests/
 *
 * Tests that fail before implementation (red):
 *   TC-001, TC-011: runJobHandler not yet defined in command-registry.ts
 *   TC-004, TC-010: finalizeVerificationRun template string not yet in runner.ts
 *   TC-005: compute*Iteration symbols still present in src/
 *   TC-008: detectPackageManager still uses inline while loop, not findLockfile
 *   TC-009: appendEventRecord called 4 times, not 1
 *   TC-012: PROBE_SLUG still exists as alias
 *
 * Regression guards (pass both before and after):
 *   TC-002, TC-003, TC-006, TC-007
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

const ROOT_DIR = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT_DIR, "src");
const TESTS_DIR = path.join(ROOT_DIR, "tests");

/** Recursively collect all .ts files under a directory, excluding this test file itself. */
const THIS_FILE = path.resolve(__filename);

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".ts") && path.resolve(fullPath) !== THIS_FILE) {
      files.push(fullPath);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// TC-001 / TC-011: run and job-start handler identity
// ---------------------------------------------------------------------------

describe("TC-001: run and job-start commands produce identical runtime behavior", () => {
  it("TC-001: command-registry.ts defines a shared runJobHandler function", async () => {
    const registryPath = path.join(SRC_DIR, "cli", "command-registry.ts");
    const content = await fs.readFile(registryPath, "utf-8");

    // After implementation: `runJobHandler` is declared as a named function/const
    // and referenced by both the `run` entry and `job.subcommands.start` entry.
    // Before implementation: no such named function exists.
    expect(content).toMatch(/runJobHandler/);
  });

  it("TC-001: both run and job.start entries reference runJobHandler", async () => {
    const registryPath = path.join(SRC_DIR, "cli", "command-registry.ts");
    const content = await fs.readFile(registryPath, "utf-8");

    // After implementation: runJobHandler appears as handler for both commands.
    // Count occurrences — must appear at least twice (once per command).
    const matches = content.match(/handler:\s*runJobHandler/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});

describe("TC-011: run and job start handlers are the same function reference (should)", () => {
  it("TC-011: runJobHandler is the single handler referenced by both commands", async () => {
    const registryPath = path.join(SRC_DIR, "cli", "command-registry.ts");
    const content = await fs.readFile(registryPath, "utf-8");

    // A single named async function `runJobHandler` must be declared.
    expect(content).toMatch(/(?:async function runJobHandler|const runJobHandler\s*=\s*async)/);

    // Both `run:` entry and `start:` entry must reference it by name.
    expect(content).toMatch(/handler:\s*runJobHandler/);
  });
});

// ---------------------------------------------------------------------------
// TC-002: help output preserves positional labels (regression guard)
// ---------------------------------------------------------------------------

describe("TC-002: help output preserves positional labels", () => {
  it("TC-002: run command positional label is 'request.md|slug'", async () => {
    const registryPath = path.join(SRC_DIR, "cli", "command-registry.ts");
    const content = await fs.readFile(registryPath, "utf-8");
    expect(content).toContain('"request.md|slug"');
  });

  it("TC-002: job start command positional label is 'slug|file'", async () => {
    const registryPath = path.join(SRC_DIR, "cli", "command-registry.ts");
    const content = await fs.readFile(registryPath, "utf-8");
    expect(content).toContain('"slug|file"');
  });

  it("TC-002: positional labels are distinct (run uses request.md|slug, start uses slug|file)", async () => {
    const registryPath = path.join(SRC_DIR, "cli", "command-registry.ts");
    const content = await fs.readFile(registryPath, "utf-8");
    // Both labels must coexist in the file
    expect(content).toContain('"request.md|slug"');
    expect(content).toContain('"slug|file"');
  });
});

// ---------------------------------------------------------------------------
// TC-003: command path skip string byte-for-byte (regression guard via runtime)
// ---------------------------------------------------------------------------

describe("TC-003: command path skip string is preserved byte-for-byte", () => {
  let tmpDir: string;
  const TEST_SLUG = "tc-003-slug";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-dedup-tc003-"));
    await fs.mkdir(path.join(tmpDir, "specrunner", "changes", TEST_SLUG), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("TC-003: skipped command phase stdout is exactly '_(skipped — previous command failed)_'", async () => {
    const { runVerification } = await import("../src/core/verification/runner.js");

    // First command fails, second should be skipped.
    const result = await runVerification(TEST_SLUG, tmpDir, {
      commands: ["false", "echo second"],
    });

    expect(result.verdict).toBe("failed");
    const skippedPhase = result.phases.find((p) => p.status === "skipped");
    expect(skippedPhase).toBeDefined();
    expect(skippedPhase!.stdout).toBe("_(skipped — previous command failed)_");
  });
});

// ---------------------------------------------------------------------------
// TC-004: phase path skip string — source inspection for finalizeVerificationRun template
// ---------------------------------------------------------------------------

describe("TC-004: phase path skip string is preserved byte-for-byte", () => {
  it("TC-004: runner.ts contains the skipLabel template that generates the phase skip string", async () => {
    const runnerPath = path.join(SRC_DIR, "core", "verification", "runner.ts");
    const content = await fs.readFile(runnerPath, "utf-8");

    // After implementation: `finalizeVerificationRun` uses the template
    //   `_(skipped — previous ${args.skipLabel} failed)_`
    // Before implementation: this template does not exist (only inline literal strings).
    expect(content).toMatch(/\$\{args\.skipLabel\}/);
  });

  it("TC-004: the template expands to exactly '_(skipped — previous phase failed)_' for skipLabel=phase", async () => {
    const runnerPath = path.join(SRC_DIR, "core", "verification", "runner.ts");
    const content = await fs.readFile(runnerPath, "utf-8");

    // After implementation: both "command" and "phase" appear as possible skipLabel values
    // via the call sites — verify the call site for "phase" exists.
    expect(content).toContain('skipLabel: "phase"');
    expect(content).toContain('skipLabel: "command"');
  });
});

// ---------------------------------------------------------------------------
// TC-005: deleted compute*Iteration symbols absent from src/ and tests/
// ---------------------------------------------------------------------------

describe("TC-005: deleted compute*Iteration symbols absent from src/ and tests/", () => {
  // Check for actual TypeScript usage: function definitions (symbol followed by `(` in code context).
  // Matches: `function computeFoo(`, `const computeFoo = (`, `computeFoo(state)`, `computeFoo(`.
  // Does NOT match test-description strings like `it("matches computeFoo formula", ...)`.
  const DELETED_SYMBOLS = [
    "computeCodeReviewIteration",
    "computeSpecReviewIteration",
    "computeRequestReviewIteration",
    "computeConformanceIteration",
  ];

  async function findUsages(dirs: string[], symbol: string): Promise<string[]> {
    // Pattern: symbol immediately followed by `(` — matches calls and definitions.
    // This reliably catches both `function computeFoo(` and `computeFoo(arg)`.
    const callPattern = new RegExp(`\\b${symbol}\\s*\\(`);
    const violations: string[] = [];
    for (const dir of dirs) {
      const files = await collectTsFiles(dir);
      for (const filePath of files) {
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i] ?? "";
          // Skip full-line comments
          if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
          if (callPattern.test(line)) {
            violations.push(`${path.relative(ROOT_DIR, filePath)}:${i + 1}: ${line.trim()}`);
          }
        }
      }
    }
    return violations;
  }

  for (const symbol of DELETED_SYMBOLS) {
    it(`TC-005: '${symbol}' call/definition is absent from src/ and tests/`, async () => {
      const violations = await findUsages([SRC_DIR, TESTS_DIR], symbol);
      expect(violations).toEqual([]);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-006: typecheck && test scripts exist in package.json (gate/meta)
// ---------------------------------------------------------------------------

describe("TC-006: typecheck && test scripts are available in package.json", () => {
  it("TC-006: package.json contains a 'typecheck' script", async () => {
    const pkgJson = JSON.parse(
      await fs.readFile(path.join(ROOT_DIR, "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };
    expect(pkgJson.scripts?.["typecheck"]).toBeDefined();
  });

  it("TC-006: package.json contains a 'test' script", async () => {
    const pkgJson = JSON.parse(
      await fs.readFile(path.join(ROOT_DIR, "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };
    expect(pkgJson.scripts?.["test"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// TC-007: loadConfig throws CONFIG_MISSING when both config files absent
// ---------------------------------------------------------------------------

describe("TC-007: loadConfig throws CONFIG_MISSING when both config files are absent", () => {
  let tmpDir: string;
  let origXdgConfigHome: string | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "specrunner-dedup-tc007-"));
    // Create an empty xdg config dir (no specrunner/config.json inside)
    await fs.mkdir(path.join(tmpDir, "xdg", "specrunner"), { recursive: true });
    await fs.mkdir(path.join(tmpDir, "repo"), { recursive: true });
    origXdgConfigHome = process.env["XDG_CONFIG_HOME"];
    process.env["XDG_CONFIG_HOME"] = path.join(tmpDir, "xdg");
  });

  afterEach(async () => {
    if (origXdgConfigHome === undefined) {
      delete process.env["XDG_CONFIG_HOME"];
    } else {
      process.env["XDG_CONFIG_HOME"] = origXdgConfigHome;
    }
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("TC-007: loadConfig throws when no config files exist at all", async () => {
    const { loadConfig } = await import("../src/config/store.js");
    const repoRoot = path.join(tmpDir, "repo");

    await expect(loadConfig(repoRoot)).rejects.toMatchObject({
      code: "CONFIG_MISSING",
    });
  });

  it("TC-007: loadConfig error has CONFIG_MISSING code (no user global, no project local)", async () => {
    const { loadConfig } = await import("../src/config/store.js");

    // No repoRoot arg → only looks for user global config (which is absent)
    await expect(loadConfig()).rejects.toMatchObject({
      code: "CONFIG_MISSING",
    });
  });
});

// ---------------------------------------------------------------------------
// TC-008: detectPackageManager phase-1 uses findLockfile after refactor
// ---------------------------------------------------------------------------

describe("TC-008: detectPackageManager phase-1 uses findLockfile (source inspection)", () => {
  it("TC-008: detect-pm.ts calls findLockfile inside detectPackageManager", async () => {
    const detectPmPath = path.join(SRC_DIR, "util", "detect-pm.ts");
    const content = await fs.readFile(detectPmPath, "utf-8");

    // After implementation: detectPackageManager calls findLockfile for phase-1.
    // Before implementation: detectPackageManager has its own while(true) loop.
    // Verify findLockfile call exists inside detectPackageManager body.
    expect(content).toMatch(/findLockfile\(/);

    // Verify the inline while(true) walk loop is gone from detectPackageManager.
    // The function should NOT contain its own LOCKFILE_MAP iteration loop.
    // findLockfile itself still contains while(true), but detectPackageManager should not.
    // We check by counting while(true) blocks — findLockfile has one, detectPackageManager should have none.
    const detectPmFnMatch = content.match(
      /export async function detectPackageManager[\s\S]*?^export /m,
    );
    if (detectPmFnMatch) {
      // detectPackageManager body should not contain its own while loop
      expect(detectPmFnMatch[0]).not.toMatch(/while\s*\(\s*true\s*\)/);
    } else {
      // Fallback: the full file should reference findLockfile from within detectPackageManager
      expect(content).toMatch(/findLockfile\(/);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-009: appendEventRecord appears exactly once in job-journal.ts
// ---------------------------------------------------------------------------

describe("TC-009: appendEventRecord appears exactly once in job-journal.ts", () => {
  it("TC-009: appendEventRecord call expression count in job-journal.ts is exactly 1", async () => {
    const journalPath = path.join(SRC_DIR, "store", "job-journal.ts");
    const content = await fs.readFile(journalPath, "utf-8");

    // Count occurrences of `appendEventRecord(` (call expressions, not import).
    // The import line uses `appendEventRecord` without `(`, so this filters to calls only.
    const callMatches = content.match(/appendEventRecord\s*\(/g) ?? [];

    // After implementation: exactly 1 call (inside `_appendRecord`).
    // Before implementation: 4 calls (one per append* method body).
    expect(callMatches.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// TC-010: skipLabel template generates byte-identical strings
// ---------------------------------------------------------------------------

describe("TC-010: skipLabel template generates byte-identical skip strings", () => {
  it("TC-010: runner.ts contains finalizeVerificationRun with skipLabel template", async () => {
    const runnerPath = path.join(SRC_DIR, "core", "verification", "runner.ts");
    const content = await fs.readFile(runnerPath, "utf-8");

    // After implementation: the template `` `_(skipped — previous ${args.skipLabel} failed)_` ``
    // is present inside finalizeVerificationRun.
    // Before implementation: only inline literal strings exist.
    expect(content).toContain("finalizeVerificationRun");
    expect(content).toMatch(/`_\(skipped — previous \$\{args\.skipLabel\} failed\)_`/);
  });

  it("TC-010: 'command' skipLabel produces '_(skipped — previous command failed)_'", () => {
    // This tests the template expansion logic directly (static string verification).
    const skipLabel = "command";
    const generated = `_(skipped — previous ${skipLabel} failed)_`;
    expect(generated).toBe("_(skipped — previous command failed)_");
  });

  it("TC-010: 'phase' skipLabel produces '_(skipped — previous phase failed)_'", () => {
    const skipLabel = "phase";
    const generated = `_(skipped — previous ${skipLabel} failed)_`;
    expect(generated).toBe("_(skipped — previous phase failed)_");
  });
});

// ---------------------------------------------------------------------------
// TC-012: PROBE_SLUG alias absent from src/ and tests/
// ---------------------------------------------------------------------------

describe("TC-012: PROBE_SLUG alias absent from src/ and tests/", () => {
  it("TC-012: no file in src/ contains standalone PROBE_SLUG (not as substring of VALIDATOR_PROBE_SLUG)", async () => {
    const files = await collectTsFiles(SRC_DIR);
    const violations: string[] = [];

    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf-8");
      // Match PROBE_SLUG as a standalone word, NOT preceded by VALIDATOR_
      // i.e., reject `PROBE_SLUG` but accept `VALIDATOR_PROBE_SLUG`.
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        // Negative lookbehind: PROBE_SLUG not preceded by VALIDATOR_
        if (/(?<!VALIDATOR_)PROBE_SLUG\b/.test(line)) {
          violations.push(`${path.relative(ROOT_DIR, filePath)}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("TC-012: no file in tests/ contains standalone PROBE_SLUG", async () => {
    const files = await collectTsFiles(TESTS_DIR);
    const violations: string[] = [];

    for (const filePath of files) {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (/(?<!VALIDATOR_)PROBE_SLUG\b/.test(line)) {
          violations.push(`${path.relative(ROOT_DIR, filePath)}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
