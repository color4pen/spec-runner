/**
 * Architecture ratchet test: RuntimeStrategy whole-port dependency cleanup (T-13).
 *
 * Asserts that forbidden patterns have 0 occurrences after the R2c refactoring.
 * Re-introduction of any pattern causes a CI failure.
 *
 * Patterns guarded:
 *   1. RuntimeStrategy & PipelineDepsBuilder — whole-port dependency (production src)
 *   2. RealRuntimeStrategy — deleted intersection type (all files)
 *   3. Pick<RuntimeStrategy — forbidden Pick-based extraction (production src)
 *   4. deriveCommitInspectionCapability — deleted shim (all files)
 *   5. deriveRevisionContentCapability — deleted shim (all files)
 *   6. canDeriveChangedFiles?. — optional chaining on required method (production src)
 *   7. as unknown as RuntimeStrategy — double cast in test files
 *
 * TC-008: production ソースに RuntimeStrategy & PipelineDepsBuilder が存在しない
 * TC-009: src/ 配下に RealRuntimeStrategy が存在しない
 * TC-010: Pick-based derive shim が src/ 配下に存在しない
 * TC-011: Pick<RuntimeStrategy が src/ 配下に存在しない
 * TC-012: as unknown as RuntimeStrategy がテストファイルに存在しない
 * TC-015: ratchet test が禁止パターンの再導入を検出する
 */

import { describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// File discovery helpers
// ---------------------------------------------------------------------------

/**
 * Recursively collect all .ts files under a directory, excluding node_modules.
 */
async function collectTsFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      const sub = await collectTsFiles(full);
      results.push(...sub);
    } else if (entry.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Production source files: src/**\/*.ts excluding __tests__/ directories.
 */
async function collectProductionFiles(srcDir: string): Promise<string[]> {
  const all = await collectTsFiles(srcDir);
  return all.filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`));
}

/**
 * Test files: src/**\/__tests__/*.ts and tests/*.ts.
 */
async function collectTestFiles(srcDir: string, testsDir: string): Promise<string[]> {
  const srcFiles = await collectTsFiles(srcDir);
  const testsFiles = await collectTsFiles(testsDir);
  const srcTestFiles = srcFiles.filter((f) => f.includes(`${path.sep}__tests__${path.sep}`));
  return [...srcTestFiles, ...testsFiles];
}

/**
 * Count occurrences of a literal string pattern across a list of files.
 * Returns an array of { file, count } for files with at least 1 match.
 */
async function findOccurrences(
  files: string[],
  pattern: string,
): Promise<{ file: string; count: number }[]> {
  const results: { file: string; count: number }[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file, "utf-8");
    } catch {
      continue;
    }
    let count = 0;
    let pos = 0;
    while (true) {
      const idx = content.indexOf(pattern, pos);
      if (idx === -1) break;
      count++;
      pos = idx + pattern.length;
    }
    if (count > 0) {
      results.push({ file, count });
    }
  }
  return results;
}

async function findOccurrencesRegex(
  files: string[],
  pattern: RegExp,
): Promise<{ file: string; count: number }[]> {
  const results: { file: string; count: number }[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await fs.readFile(file, "utf-8");
    } catch {
      continue;
    }
    const matches = content.match(new RegExp(pattern.source, "g" + (pattern.flags.replace("g", ""))));
    const count = matches ? matches.length : 0;
    if (count > 0) {
      results.push({ file, count });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Repo root resolution
// ---------------------------------------------------------------------------

// The ratchet test itself is at src/core/port/__tests__/runtime-strategy-ratchet.test.ts
// Repo root is 4 levels up from __tests__: src/core/port/__tests__ → src/core/port → src/core → src → repo root
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
const SRC_DIR = path.join(REPO_ROOT, "src");
const TESTS_DIR = path.join(REPO_ROOT, "tests");

// Self-exclusion: exclude this ratchet test file from all pattern searches to avoid
// self-referential false positives. The ratchet test necessarily mentions the forbidden
// patterns in its own string literals, comments, and findOccurrences() call sites.
const SELF_FILE = path.join(import.meta.dirname, "runtime-strategy-ratchet.test.ts");

// ---------------------------------------------------------------------------
// TC-008: RuntimeStrategy & PipelineDepsBuilder が production ソースに存在しない
// ---------------------------------------------------------------------------

describe("TC-008: production ソースに RuntimeStrategy & PipelineDepsBuilder が存在しない", () => {
  it("TC-008: `RuntimeStrategy & PipelineDepsBuilder` が production src に 0 件", async () => {
    const files = await collectProductionFiles(SRC_DIR);
    const hits = await findOccurrences(files, "RuntimeStrategy & PipelineDepsBuilder");
    expect(hits, `Found RuntimeStrategy & PipelineDepsBuilder in:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-009: RealRuntimeStrategy が src/ 配下に存在しない
// ---------------------------------------------------------------------------

describe("TC-009: RealRuntimeStrategy が src/ 配下に存在しない", () => {
  it("TC-009: `RealRuntimeStrategy` が src/ 全ファイル（tests 含む）に 0 件", async () => {
    const files = (await collectTsFiles(SRC_DIR)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(files, "RealRuntimeStrategy");
    expect(hits, `Found RealRuntimeStrategy in:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-010: Pick-based derive shim が src/ 配下に存在しない
// ---------------------------------------------------------------------------

describe("TC-010: Pick-based derive shim が src/ 配下に存在しない", () => {
  it("TC-010a: `deriveCommitInspectionCapability` が src/ 全ファイルに 0 件", async () => {
    const files = (await collectTsFiles(SRC_DIR)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(files, "deriveCommitInspectionCapability");
    expect(hits, `Found deriveCommitInspectionCapability in:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`).toHaveLength(0);
  });

  it("TC-010b: `deriveRevisionContentCapability` が src/ 全ファイルに 0 件", async () => {
    const files = (await collectTsFiles(SRC_DIR)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(files, "deriveRevisionContentCapability");
    expect(hits, `Found deriveRevisionContentCapability in:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-011: Pick<RuntimeStrategy が src/ 配下に存在しない
// ---------------------------------------------------------------------------

describe("TC-011: Pick<RuntimeStrategy が src/ 配下に存在しない", () => {
  it("TC-011: `Pick<RuntimeStrategy` が production src に 0 件", async () => {
    const files = await collectProductionFiles(SRC_DIR);
    const hits = await findOccurrences(files, "Pick<RuntimeStrategy");
    expect(hits, `Found Pick<RuntimeStrategy in:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-012: as unknown as RuntimeStrategy がテストファイルに存在しない
// ---------------------------------------------------------------------------

describe("TC-012: as unknown as RuntimeStrategy がテストファイルに存在しない", () => {
  it("TC-012: `as unknown as RuntimeStrategy` が tests/ および src/__tests__/ に 0 件", async () => {
    const testFiles = (await collectTestFiles(SRC_DIR, TESTS_DIR)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(testFiles, "as unknown as RuntimeStrategy");
    expect(hits, `Found "as unknown as RuntimeStrategy" in:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`).toHaveLength(0);
  });

  // TC-012b: `as any as RuntimeStrategy` は `as unknown as RuntimeStrategy` と同じ
  // 型安全破壊パターン。TC-012 は unknown 限定だったため tests/unit/pipeline/ で見逃した。
  it("TC-012b: `as any as RuntimeStrategy` が tests/ および src/__tests__/ に 0 件", async () => {
    const testFiles = (await collectTestFiles(SRC_DIR, TESTS_DIR)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(testFiles, "as any as RuntimeStrategy");
    expect(hits, `Found "as any as RuntimeStrategy" in:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ratchet: canDeriveChangedFiles?. が production src に存在しない
// (TypeScript 型システムは外側 ?. により内側 ?. を型エラーにしないため ratchet で明示禁止)
// ---------------------------------------------------------------------------

describe("Ratchet: canDeriveChangedFiles?. が production src に存在しない", () => {
  it("Ratchet: `canDeriveChangedFiles?.` が production src に 0 件", async () => {
    const files = await collectProductionFiles(SRC_DIR);
    const hits = await findOccurrences(files, "canDeriveChangedFiles?.");
    expect(hits, `Found canDeriveChangedFiles?. in:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Ratchet: RealRuntimeStrategy が tests/ 配下にも存在しない
// ---------------------------------------------------------------------------

describe("TC-031: RealRuntimeStrategy がテストファイルを含む全ファイルに存在しない", () => {
  it("TC-031: `RealRuntimeStrategy` が tests/ に 0 件", async () => {
    const files = await collectTsFiles(TESTS_DIR);
    const hits = await findOccurrences(files, "RealRuntimeStrategy");
    expect(hits, `Found RealRuntimeStrategy in:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-035: Command テストが RuntimeStrategy & PipelineDepsBuilder を再導入しない
//
// Blocking Issue 2 (PR #1107): Command-related test fakes must be narrowed to the
// production constructor's required narrow contract instead of reimplementing the
// full RuntimeStrategy & PipelineDepsBuilder whole-port type. This ratchet prevents
// re-introduction in:
//   - tests/unit/core/command/  (runner, runner-fidelity-gate, pipeline-run-*, resume)
//   - tests/core/provider-readiness-gate.test.ts
// ---------------------------------------------------------------------------

describe("TC-035: Command テストに RuntimeStrategy & PipelineDepsBuilder が存在しない", () => {
  it("TC-035: `RuntimeStrategy & PipelineDepsBuilder` が tests/unit/core/command/ に 0 件", async () => {
    const commandTestDir = path.join(TESTS_DIR, "unit", "core", "command");
    const files = (await collectTsFiles(commandTestDir)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(files, "RuntimeStrategy & PipelineDepsBuilder");
    expect(
      hits,
      `Found RuntimeStrategy & PipelineDepsBuilder in Command test files:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });

  it("TC-035b: `RuntimeStrategy & PipelineDepsBuilder` が tests/core/provider-readiness-gate.test.ts に 0 件", async () => {
    const gateTestFile = path.join(TESTS_DIR, "core", "provider-readiness-gate.test.ts");
    const hits = await findOccurrences([gateTestFile], "RuntimeStrategy & PipelineDepsBuilder");
    expect(
      hits,
      `Found RuntimeStrategy & PipelineDepsBuilder in provider-readiness-gate.test.ts:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });

  it("TC-035c: `RuntimeStrategy & PipelineDepsBuilder` が tests/unit/core/runtime/ に 0 件", async () => {
    const runtimeTestDir = path.join(TESTS_DIR, "unit", "core", "runtime");
    const files = (await collectTsFiles(runtimeTestDir)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(files, "RuntimeStrategy & PipelineDepsBuilder");
    expect(
      hits,
      `Found RuntimeStrategy & PipelineDepsBuilder in Runtime test files:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });

  // TC-035d: step-layer tests (tests/unit/step/) are now guarded after R2c narrowing.
  // Previously this directory was outside TC-035 scope; the monolithic fakes in
  // unpushable-path-contract.test.ts and executor-input-validation.test.ts have been
  // replaced with narrow capability stubs (StepIoValidationCapability / noopStepArtifact).
  it("TC-035d: `RuntimeStrategy & PipelineDepsBuilder` が tests/unit/step/ に 0 件", async () => {
    const stepTestDir = path.join(TESTS_DIR, "unit", "step");
    const files = (await collectTsFiles(stepTestDir)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(files, "RuntimeStrategy & PipelineDepsBuilder");
    expect(
      hits,
      `Found RuntimeStrategy & PipelineDepsBuilder in step-layer test files:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });

  // TC-035e: tests/unit/core/step/ is now guarded; monolithic fakes in
  // executor-cli-entry-oid.test.ts and verification-phase-outcome-executor.test.ts
  // have been replaced with narrow StepArtifactLifecycleCapability /
  // StepIoValidationCapability / ChangedFilesCapability stubs.
  it("TC-035e: `RuntimeStrategy & PipelineDepsBuilder` が tests/unit/core/step/ に 0 件", async () => {
    const coreStepTestDir = path.join(TESTS_DIR, "unit", "core", "step");
    const files = (await collectTsFiles(coreStepTestDir)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(files, "RuntimeStrategy & PipelineDepsBuilder");
    expect(
      hits,
      `Found RuntimeStrategy & PipelineDepsBuilder in tests/unit/core/step/ files:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });

  // TC-035f: tests/attach/ is now guarded; the monolithic fake in
  // attach-resume-e2e.test.ts has been replaced with narrow capability stubs
  // (makeMachineAStepArtifact / machineAStepIo / machineAChangedFiles).
  it("TC-035f: `RuntimeStrategy & PipelineDepsBuilder` が tests/attach/ に 0 件", async () => {
    const attachTestDir = path.join(TESTS_DIR, "attach");
    const files = (await collectTsFiles(attachTestDir)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(files, "RuntimeStrategy & PipelineDepsBuilder");
    expect(
      hits,
      `Found RuntimeStrategy & PipelineDepsBuilder in tests/attach/ files:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });

  // TC-035g: tests/unit/pipeline/ は pipeline 層テストのディレクトリ。
  // pipeline-sole-committer-round-guard.test.ts の makeRuntimeStrategyMock が
  // RuntimeStrategy から RoundGitEffectsCapability へ置き換えられたため、ここもガード対象とする。
  it("TC-035g: `RuntimeStrategy & PipelineDepsBuilder` が tests/unit/pipeline/ に 0 件", async () => {
    const pipelineTestDir = path.join(TESTS_DIR, "unit", "pipeline");
    const files = (await collectTsFiles(pipelineTestDir)).filter((f) => f !== SELF_FILE);
    const hits = await findOccurrences(files, "RuntimeStrategy & PipelineDepsBuilder");
    expect(
      hits,
      `Found RuntimeStrategy & PipelineDepsBuilder in tests/unit/pipeline/ files:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });

  // TC-035h: root-level tests/ files (e.g., tests/custom-reviewers-e2e.test.ts,
  // tests/pipeline-sole-committer-e2e.test.ts) are explicitly guarded here.
  // These files live directly under tests/ and are not picked up by any of the
  // subdirectory-scoped checks above (tests/unit/, tests/attach/, tests/core/).
  // Note: collectTestFiles() already includes all of TESTS_DIR recursively for
  // TC-012, but the RuntimeStrategy & PipelineDepsBuilder ratchet must be explicit.
  it("TC-035h: `RuntimeStrategy & PipelineDepsBuilder` が root-level tests/ ファイルに 0 件", async () => {
    const entries = await fs.readdir(TESTS_DIR);
    const rootLevelFiles = (
      await Promise.all(
        entries.map(async (entry) => {
          const full = path.join(TESTS_DIR, entry);
          let stat;
          try {
            stat = await fs.stat(full);
          } catch {
            return null;
          }
          return stat.isFile() && entry.endsWith(".ts") ? full : null;
        }),
      )
    ).filter((f): f is string => f !== null);
    const hits = await findOccurrences(rootLevelFiles, "RuntimeStrategy & PipelineDepsBuilder");
    expect(
      hits,
      `Found RuntimeStrategy & PipelineDepsBuilder in root-level tests/ files:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-037: No whole-port RuntimeStrategy fakes remain in test files
// ---------------------------------------------------------------------------

describe("TC-037: whole-port test fakes eliminated", () => {
  // TC-037a: 0 `import type { RuntimeStrategy }` (or similar named import) in test files
  // Exceptions: ratchet file itself, and command-lifecycle-contract.test.ts
  it("TC-037a: RuntimeStrategy named imports absent from test files", async () => {
    const allTestFiles = await collectTestFiles(SRC_DIR, TESTS_DIR);
    const ALLOWED_FILES = new Set([
      path.join(REPO_ROOT, "src/core/port/__tests__/runtime-strategy-ratchet.test.ts"),
      path.join(REPO_ROOT, "src/core/runtime/__tests__/command-lifecycle-contract.test.ts"),
    ]);
    const candidateFiles = allTestFiles.filter((f) => !ALLOWED_FILES.has(f));
    // Match: `import ... { RuntimeStrategy ...` (named import, possibly with aliases or other names)
    const hits = await findOccurrencesRegex(candidateFiles, /import[^;]*\{\s*[^}]*\bRuntimeStrategy\b/);
    expect(
      hits,
      `Found RuntimeStrategy named imports in test files:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });

  // TC-037b: 0 `as never` slot injections in tests/unit/step/
  // These were used to bypass TypeScript when assigning monolith fakes to typed slots.
  // Pattern: stepArtifact: x as never, stepIo: x as never, changedFiles: x as never
  it("TC-037b: `as never` slot injections absent from tests/unit/step/", async () => {
    const STEP_UNIT_DIR = path.join(TESTS_DIR, "unit/step");
    let entries: string[];
    try {
      entries = await fs.readdir(STEP_UNIT_DIR);
    } catch {
      entries = [];
    }
    const stepTestFiles = entries
      .filter((e) => e.endsWith(".ts"))
      .map((e) => path.join(STEP_UNIT_DIR, e));
    // Match: `(<capability slot>): ... as never` for all 7 PipelineDeps capability slots (D7 item 9 / T-16)
    const hits = await findOccurrencesRegex(
      stepTestFiles,
      /\b(stepArtifact|stepIo|changedFiles|roundGitEffects|terminalState|commitInspection|revisionContent)\s*:\s*[^,\n]* as never/,
    );
    expect(
      hits,
      `Found "as never" slot injections in tests/unit/step/:\n${hits.map((h) => `  ${h.file} (${h.count}x)`).join("\n")}`,
    ).toHaveLength(0);
  });
});
