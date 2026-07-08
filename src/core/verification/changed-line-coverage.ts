/**
 * Changed-line coverage gate.
 *
 * T-04: Pure evaluation function — applies decision table to lcov + diff data.
 * T-05: Gate orchestrator — runs coverage command, parses lcov, calls evaluator.
 *
 * Design:
 * - fail-closed: files in `include` that are absent from lcov → fail.
 * - pass: files whose changed lines have no DA records (type definitions, comments, etc.).
 * - fail: files whose changed DA lines are all unexecuted (default threshold: 0 executed).
 * - exclude: files matching any exclude glob → skipped (not counted as failures).
 * - No external dependencies beyond node:fs/promises and existing utilities.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { globMatch } from "../../util/glob-match.js";
import { parseLcov } from "./lcov.js";
import { getChangedFilesAndLines } from "./changed-lines.js";
import { spawnCommand } from "./commands.js";
import { stripSecrets } from "../../util/env-filter.js";
import type { PhaseResult } from "./runner.js";
import type { CoverageConfig } from "../../config/schema.js";
import type { SpawnFn } from "./changed-lines.js";

// ---------------------------------------------------------------------------
// T-04: Pure evaluation function
// ---------------------------------------------------------------------------

/** Reason a file failed the coverage gate. */
export type FailReason = "not-loaded" | "unexecuted" | "below-threshold";

/** Per-file failure record. */
export interface FailedFile {
  file: string;
  reason: FailReason;
  /** Execution ratio (executedLines / changedDaLines). Present only for "below-threshold". */
  ratio?: number;
}

/** Input to the pure evaluator. */
export interface EvaluateInput {
  /** lcov parse result: file → (line → count). */
  lcov: Map<string, Map<number, number>>;
  /** Changed lines per file: file → Set of line numbers. */
  changedLinesByFile: Map<string, Set<number>>;
  /** Glob patterns: only files matching one of these are checked. */
  include: string[];
  /** Glob patterns: files matching any of these are skipped. */
  exclude?: string[];
  /**
   * Minimum ratio of changed DA lines that must be executed.
   * Default (undefined): at least 1 executed line is sufficient.
   * Range: 0–1 when specified.
   */
  minChangedLineCoverage?: number;
}

/** Result of the pure evaluator. */
export interface EvaluateResult {
  status: "passed" | "failed";
  failedFiles: FailedFile[];
  skippedFiles: string[];
  stdout: string;
}

/**
 * Evaluate changed-line coverage against the decision table.
 *
 * Decision table (applied per changed file `f`):
 * 1. `include` not matched OR `exclude` matched → skippedFiles (not a failure).
 * 2. `f` absent from lcov SF records → failedFiles (reason: "not-loaded") — fail-closed.
 * 3. `f` present in lcov, changed lines have no DA records → pass (non-executable lines).
 * 4. `f` present in lcov, changed DA lines exist:
 *    - Default: executed lines >= 1 → pass; executed lines == 0 → fail (reason: "unexecuted").
 *    - With minChangedLineCoverage: executed / total changedDA >= threshold → pass; else fail.
 */
export function evaluateChangedLineCoverage(input: EvaluateInput): EvaluateResult {
  const { lcov, changedLinesByFile, include, exclude, minChangedLineCoverage } = input;

  const failedFiles: FailedFile[] = [];
  const skippedFiles: string[] = [];

  for (const [file, changedLines] of changedLinesByFile) {
    // 1. Filter by include/exclude globs.
    const matchesInclude = include.some((pat) => globMatch(file, pat));
    if (!matchesInclude) {
      skippedFiles.push(file);
      continue;
    }

    const matchesExclude = exclude?.some((pat) => globMatch(file, pat)) ?? false;
    if (matchesExclude) {
      skippedFiles.push(file);
      continue;
    }

    // 2. Check lcov presence (fail-closed).
    if (!lcov.has(file)) {
      failedFiles.push({ file, reason: "not-loaded" });
      continue;
    }

    const fileCoverage = lcov.get(file)!;

    // 3. Find which changed lines have DA records.
    const changedDaLines: number[] = [];
    for (const lineNo of changedLines) {
      if (fileCoverage.has(lineNo)) {
        changedDaLines.push(lineNo);
      }
    }

    // If no changed line has a DA record, it's all non-executable (type defs, comments) → pass.
    if (changedDaLines.length === 0) {
      continue;
    }

    // 4. Threshold evaluation.
    const executedLines = changedDaLines.filter((l) => (fileCoverage.get(l) ?? 0) > 0);

    if (minChangedLineCoverage !== undefined) {
      // Explicit threshold: executed / total changedDA >= threshold.
      const ratio = executedLines.length / changedDaLines.length;
      if (ratio < minChangedLineCoverage) {
        failedFiles.push({ file, reason: "below-threshold", ratio });
      }
    } else {
      // Default: at least 1 executed line.
      if (executedLines.length === 0) {
        failedFiles.push({ file, reason: "unexecuted" });
      }
    }
  }

  const status = failedFiles.length === 0 ? "passed" : "failed";

  // Build human-readable summary.
  const lines: string[] = [];
  if (status === "passed") {
    lines.push(
      `changed-line-coverage: passed (${changedLinesByFile.size} changed files checked, ${skippedFiles.length} skipped)`,
    );
  } else {
    lines.push(
      `changed-line-coverage: failed — ${failedFiles.length} file(s) did not meet coverage requirements`,
    );
    for (const { file, reason, ratio } of failedFiles) {
      if (reason === "not-loaded") {
        lines.push(`  - ${file}: not loaded by test suite (absent from lcov)`);
      } else if (reason === "below-threshold") {
        // ratio and minChangedLineCoverage are both defined when reason is "below-threshold"
        const executedPct = Math.round((ratio ?? 0) * 100);
        const thresholdPct = Math.round(minChangedLineCoverage! * 100);
        lines.push(
          `  - ${file}: ${executedPct}% coverage of changed DA lines (threshold ${thresholdPct}%)`,
        );
      } else {
        lines.push(`  - ${file}: changed DA lines were not executed`);
      }
    }
  }

  if (skippedFiles.length > 0) {
    lines.push(`  Skipped (not in coverage surface): ${skippedFiles.join(", ")}`);
  }

  return {
    status,
    failedFiles,
    skippedFiles,
    stdout: lines.join("\n"),
  };
}

// ---------------------------------------------------------------------------
// T-05: Gate orchestrator
// ---------------------------------------------------------------------------

/** Options for the gate orchestrator. */
export interface RunGateOptions {
  /** Change slug (unused in gate logic; available for callers). */
  slug: string;
  /** Working directory (repo root and cwd for all operations). */
  cwd: string;
  /** Coverage configuration from project config. */
  coverage: CoverageConfig;
  /** Base branch to diff against (default: "main"). */
  baseBranch?: string;
  /** Spawn function for dependency injection in tests. */
  spawn?: SpawnFn;
  /**
   * Lockfile root directory (monorepo root). When provided and different from `cwd`,
   * its `node_modules/.bin` is added to PATH so coverage commands can resolve
   * hoisted binaries — same behavior as `verification.commands` path.
   */
  root?: string;
}

/** Phase name for the changed-line coverage gate. */
export const CHANGED_LINE_COVERAGE_PHASE = "changed-line-coverage" as const;

/**
 * Run the changed-line coverage gate.
 *
 * Steps:
 * 1. Execute coverage.command via `sh -c` (same as other verification commands).
 * 2. If exit code !== 0 → return failed PhaseResult with stdout/stderr.
 * 3. Read coverage.lcovPath (cwd-relative). If absent/empty → return failed PhaseResult.
 * 4. Parse lcov, get changed files and lines.
 * 5. Run evaluateChangedLineCoverage and return the appropriate PhaseResult.
 *
 * @returns PhaseResult with phase === "changed-line-coverage".
 */
export async function runChangedLineCoverageGate(
  options: RunGateOptions,
): Promise<PhaseResult> {
  const { cwd, coverage, baseBranch = "main", spawn, root } = options;
  const start = Date.now();

  // Step 1: Run coverage command.
  const commandStr =
    typeof coverage.command === "string" ? coverage.command : coverage.command.run;

  const env = stripSecrets(process.env as Record<string, string | undefined>);
  const { exitCode, stdout: cmdStdout, stderr: cmdStderr } = await spawnCommand(
    commandStr,
    cwd,
    env,
    root,
  );

  if (exitCode !== 0) {
    return {
      phase: CHANGED_LINE_COVERAGE_PHASE,
      status: "failed",
      stdout: [
        "changed-line-coverage: coverage command failed",
        cmdStdout,
      ]
        .filter(Boolean)
        .join("\n"),
      stderr: cmdStderr,
      exitCode: 1,
      durationMs: Date.now() - start,
    };
  }

  // Step 2: Read lcov file.
  const lcovAbsPath = path.resolve(cwd, coverage.lcovPath);
  let lcovText: string;
  try {
    lcovText = await fs.readFile(lcovAbsPath, "utf-8");
  } catch {
    return {
      phase: CHANGED_LINE_COVERAGE_PHASE,
      status: "failed",
      stdout: `changed-line-coverage: lcov file not found at ${coverage.lcovPath}`,
      stderr: "",
      exitCode: 1,
      durationMs: Date.now() - start,
    };
  }

  if (!lcovText.trim()) {
    return {
      phase: CHANGED_LINE_COVERAGE_PHASE,
      status: "failed",
      stdout: `changed-line-coverage: lcov file is empty at ${coverage.lcovPath}`,
      stderr: "",
      exitCode: 1,
      durationMs: Date.now() - start,
    };
  }

  // Step 3: Parse lcov (SF paths normalized to cwd-relative).
  const lcov = parseLcov(lcovText, cwd);

  // Step 4: Get changed files and lines from git.
  // Fail-closed: if git diff fails, the gate cannot verify the declared
  // guarantee — report failed instead of passing on an empty change set.
  let changedLinesByFile: Map<string, Set<number>>;
  try {
    changedLinesByFile = await getChangedFilesAndLines({
      cwd,
      baseBranch,
      spawn,
    });
  } catch (err) {
    return {
      phase: CHANGED_LINE_COVERAGE_PHASE,
      status: "failed",
      stdout:
        `changed-line-coverage: failed to derive changed lines from git — ` +
        `cannot verify the declared coverage guarantee; failing closed.\n${(err as Error).message}`,
      stderr: "",
      exitCode: 1,
      durationMs: Date.now() - start,
    };
  }

  // Step 5: Evaluate.
  const evaluation = evaluateChangedLineCoverage({
    lcov,
    changedLinesByFile,
    include: coverage.include,
    exclude: coverage.exclude,
    minChangedLineCoverage: coverage.minChangedLineCoverage,
  });

  return {
    phase: CHANGED_LINE_COVERAGE_PHASE,
    status: evaluation.status,
    stdout: evaluation.stdout,
    stderr: "",
    exitCode: evaluation.status === "passed" ? 0 : 1,
    durationMs: Date.now() - start,
  };
}
