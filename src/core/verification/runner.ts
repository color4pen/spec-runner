/**
 * Verification runner — spawns package.json scripts and collects results.
 * Uses node:child_process.spawn (NOT bun:* / Bun.*) per project rules.
 *
 * Supports two execution paths:
 * 1. commands path: executes user-defined commands from verification.commands config (language-agnostic)
 * 2. phase path (fallback): detects and runs package.json scripts (build/typecheck/test/lint/security)
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { stripSecrets } from "../../util/env-filter.js";
import { maskAbsolutePaths } from "../../util/path-mask.js";
import * as path from "node:path";
import { PHASE_NAMES, PHASE_SCRIPTS } from "./phases.js";
import type { PhaseName, ScriptPhaseName } from "./phases.js";
import { runTestCoveragePhase } from "./test-coverage.js";
import { detectSkippedTests } from "./skip-detect.js";
import { verificationResultPath } from "../../util/paths.js";
import { normalizeCommands, spawnCommand } from "./commands.js";
import type { VerificationConfig } from "../../config/schema.js";
import { detectPackageManager, runCommand } from "../../util/detect-pm.js";
import { runChangedLineCoverageGate, CHANGED_LINE_COVERAGE_PHASE } from "./changed-line-coverage.js";

/** Result for a single verification phase. */
export interface PhaseResult {
  /** Phase name or command label used for display. */
  phase: string;
  status: "passed" | "failed" | "skipped";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  /**
   * Best-effort count of skipped/pending/todo tests detected in this phase's
   * output. Present only for the `test` phase in the phase fallback path when
   * at least one skip was detected. Absent/omitted otherwise. Never affects
   * the verdict.
   */
  skippedCount?: number;
}

/** Aggregate result of the full verification run. */
export interface VerificationResult {
  slug: string;
  verdict: "passed" | "failed";
  phases: PhaseResult[];
  /** Set when all phases were skipped (no runnable scripts found). */
  errorCode?: string;
}

/**
 * Type guard: returns true if phaseName is a script-based phase
 * (i.e. it has an entry in PHASE_SCRIPTS and runs via the detected package manager run command).
 */
function isScriptPhase(name: PhaseName): name is ScriptPhaseName {
  return name in PHASE_SCRIPTS;
}

/**
 * Check if a script name exists in the target project's package.json.
 * Returns false if package.json is absent or doesn't have the script.
 */
async function scriptExists(scriptName: string, cwd: string): Promise<boolean> {
  try {
    const pkgPath = path.join(cwd, "package.json");
    const raw = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    return Boolean(pkg.scripts?.[scriptName]);
  } catch {
    return false;
  }
}

/**
 * Spawn `<command> <args>` and collect stdout/stderr.
 * Returns the exit code and collected output.
 */
function spawnScript(
  command: string,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: stripSecrets(process.env as Record<string, string | undefined>),
    });

    let stdoutBuf = "";
    let stderrBuf = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBuf += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdoutBuf,
        stderr: stderrBuf,
      });
    });

    child.on("error", (err) => {
      resolve({
        exitCode: 1,
        stdout: "",
        stderr: err.message,
      });
    });
  });
}

/**
 * Write the verification result markdown to the change folder.
 * Absolute paths in the output are normalized before writing:
 * paths under cwd become repo-relative; other $HOME paths become ~/…
 *
 * @param result - Verification result to write.
 * @param outputPath - Absolute path to write the markdown file.
 * @param cwd - Working directory for path normalization.
 * @param coverageSkipNote - When truthy, appended as a note after the verdict block.
 *   Used when coverage is not declared (gate skipped) to make it visible in the output.
 *   When coverage is declared (gate ran or was fail-fast skipped), pass undefined.
 */
async function writeVerificationResult(
  result: VerificationResult,
  outputPath: string,
  cwd: string,
  coverageSkipNote?: string,
): Promise<void> {
  const iterNum = 1; // iteration number placeholder; caller provides full path
  const lines: string[] = [];

  lines.push(`# Verification Result — ${result.slug} — iter ${iterNum}`);
  lines.push("");
  lines.push(`## Verdict: ${result.verdict}`);
  lines.push("");

  // Skip annotation: qualify a passed verdict when the test phase detected skips.
  // Purpose is to distinguish a clean pass from a "passed with skips" result.
  // When the verdict is failed, the failure is already surfaced directly — no annotation needed.
  if (result.verdict === "passed") {
    const testPhase = result.phases.find((p) => p.phase === "test");
    if (testPhase?.skippedCount !== undefined && testPhase.skippedCount > 0) {
      const n = testPhase.skippedCount;
      lines.push(
        `> Note — passed with skips: ${n} test(s) reported skipped/pending in the \`test\` phase output (best-effort detection). A "passed" verdict does not attest that skipped tests were exercised. See \`## Phase: test\`.`,
      );
      lines.push("");
    }
  }

  // Coverage gate skip note: emitted when verification.coverage is not declared.
  // Visible in the verdict area so reviewers know the gate was not active.
  if (coverageSkipNote) {
    lines.push(`> Note — ${coverageSkipNote}`);
    lines.push("");
  }

  if (result.errorCode) {
    lines.push(`errorCode: ${result.errorCode}`);
    lines.push("");
  }

  lines.push("## Phase Results");
  lines.push("");
  lines.push("| # | Phase | Status | Duration | Exit Code |");
  lines.push("|---|-------|--------|----------|-----------|");
  result.phases.forEach((p, i) => {
    const dur = p.status === "skipped" ? "—" : `${(p.durationMs / 1000).toFixed(1)}s`;
    const code = p.status === "skipped" ? "—" : String(p.exitCode ?? "—");
    lines.push(`| ${i + 1} | ${p.phase} | ${p.status} | ${dur} | ${code} |`);
  });
  lines.push("");

  for (const p of result.phases) {
    lines.push(`## Phase: ${p.phase}`);
    lines.push("");
    if (p.status === "skipped") {
      // TC-020: if the phase produced a stdout (e.g. skip reason), show it instead
      // of the generic "script not found in package.json" message.
      if (p.stdout) {
        lines.push(p.stdout);
      } else {
        lines.push("_(skipped — script not found in package.json)_");
      }
    } else {
      if (p.status === "failed") {
        lines.push(`Step '${p.phase}' failed`);
        lines.push("");
      }
      const combined = [p.stdout, p.stderr].filter(Boolean).join("\n");
      lines.push("```");
      lines.push(combined || "(no output)");
      lines.push("```");
    }
    lines.push("");
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const content = maskAbsolutePaths(lines.join("\n"), { cwd });
  await fs.writeFile(outputPath, content, "utf-8");
}

/**
 * Check if the worktree's package.json scripts section has been tampered relative to the baseline (origin/<baseBranch>).
 * Tampering is defined as changing the value of, or deleting, a key that exists in the baseline.
 * Adding new script keys that do not exist in the baseline is NOT considered tampering
 * (greenfield implementations legitimately add scripts absent from the base branch).
 * Returns { tampered: true, diff } listing only the offending baseline keys, { tampered: false } otherwise.
 * Skips check (returns { tampered: false }) if baseline cannot be retrieved or JSON is malformed.
 */
async function checkPackageJsonScriptsIntegrity(
  cwd: string,
  baseBranch: string,
): Promise<{ tampered: boolean; diff?: string }> {
  // Step 1: get baseline package.json from origin/<baseBranch>
  const baselineRaw = await new Promise<string | null>((resolve) => {
    const child = spawn("git", ["show", `origin/${baseBranch}:package.json`], {
      cwd,
      shell: false,
      env: stripSecrets(process.env as Record<string, string | undefined>),
    });

    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        resolve(null);
      } else {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      }
    });

    child.on("error", () => {
      resolve(null);
    });
  });

  // Baseline not available → skip check (new project without package.json on base branch)
  if (baselineRaw === null) {
    return { tampered: false };
  }

  // Step 2: read worktree's package.json
  let currentRaw: string;
  try {
    currentRaw = await fs.readFile(path.join(cwd, "package.json"), "utf-8");
  } catch {
    return { tampered: false };
  }

  // Step 3: parse and compare scripts sections
  try {
    const baselinePkg = JSON.parse(baselineRaw) as { scripts?: Record<string, string> };
    const currentPkg = JSON.parse(currentRaw) as { scripts?: Record<string, string> };

    const baselineScripts: Record<string, string> = baselinePkg.scripts ?? {};
    const currentScripts: Record<string, string> = currentPkg.scripts ?? {};

    // Collect offending entries: baseline keys whose value was changed or that were deleted.
    // Keys present only in currentScripts (new additions) are intentionally excluded —
    // adding scripts is a legitimate greenfield operation and does not subvert existing checks.
    const offendingEntries: Array<[string, string]> = [];
    for (const [key, baselineValue] of Object.entries(baselineScripts)) {
      if (
        !Object.prototype.hasOwnProperty.call(currentScripts, key) ||
        currentScripts[key] !== baselineValue
      ) {
        offendingEntries.push([key, baselineValue]);
      }
    }

    if (offendingEntries.length > 0) {
      const baselineDiff: Record<string, string> = {};
      const currentDiff: Record<string, string> = {};
      for (const [key, baselineValue] of offendingEntries) {
        baselineDiff[key] = baselineValue;
        // Deleted keys are absent from current; only include key when it still exists (value changed).
        if (Object.prototype.hasOwnProperty.call(currentScripts, key)) {
          currentDiff[key] = currentScripts[key] as string;
        }
      }
      const diff =
        "Baseline scripts:\n" +
        JSON.stringify(baselineDiff, null, 2) +
        "\n\nCurrent scripts:\n" +
        JSON.stringify(currentDiff, null, 2);
      return { tampered: true, diff };
    }

    return { tampered: false };
  } catch {
    // Malformed JSON → skip check (will be caught by build phase)
    return { tampered: false };
  }
}

/**
 * Run verification for the given slug.
 *
 * Two execution paths:
 * 1. **commands path**: when verificationConfig.commands is defined, executes each command via
 *    `sh -c <command>` in order (fail-fast). Language-agnostic.
 * 2. **phase fallback path**: when commands is undefined, detects and runs package.json scripts
 *    (build → typecheck → test → lint → security → test-coverage) via the detected package manager run command.
 *
 * Writes verification-result.md to the change folder.
 *
 * @param slug - Change slug (used for output path and result title)
 * @param cwd - Working directory (defaults to process.cwd())
 * @param verificationConfig - Optional verification config from project local config
 * @param baseBranch - Base branch name for package.json integrity check (phase fallback path only)
 */
export async function runVerification(
  slug: string,
  cwd: string = process.cwd(),
  verificationConfig?: VerificationConfig,
  baseBranch?: string,
): Promise<VerificationResult> {
  const coverage = verificationConfig?.coverage;

  // Dispatch to commands path if verification.commands is defined
  if (verificationConfig?.commands !== undefined) {
    return runVerificationCommands(slug, cwd, verificationConfig.commands, coverage, baseBranch);
  }

  // Fallback: phase detection path (existing behavior)
  return runVerificationPhases(slug, cwd, baseBranch, coverage);
}

/**
 * Commands path: execute user-defined commands in order (fail-fast).
 * Each command is run via `sh -c <command>`.
 * After all commands, runs the changed-line coverage gate if coverage is declared.
 */
async function runVerificationCommands(
  slug: string,
  cwd: string,
  rawCommands: import("../../config/schema.js").VerificationCommand[],
  coverage?: import("../../config/schema.js").CoverageConfig,
  baseBranch?: string,
): Promise<VerificationResult> {
  const normalized = normalizeCommands(rawCommands);
  const { root } = await detectPackageManager(cwd);
  const phases: PhaseResult[] = [];
  let failed = false;

  for (const cmd of normalized) {
    const label = cmd.name ?? cmd.run;

    if (failed) {
      phases.push({
        phase: label,
        status: "skipped",
        stdout: "_(skipped — previous command failed)_",
        stderr: "",
        exitCode: null,
        durationMs: 0,
      });
      continue;
    }

    const startMs = Date.now();
    const { exitCode, stdout, stderr } = await spawnCommand(cmd.run, cwd, stripSecrets(process.env as Record<string, string | undefined>), root);
    const durationMs = Date.now() - startMs;

    const status = exitCode === 0 ? "passed" : "failed";
    phases.push({ phase: label, status, stdout, stderr, exitCode, durationMs });

    if (status === "failed") {
      failed = true;
    }
  }

  // Run changed-line coverage gate after all commands.
  let coverageSkipNote: string | undefined;
  if (coverage !== undefined) {
    if (failed) {
      // Fail-fast: prior commands failed — skip the gate.
      phases.push({
        phase: CHANGED_LINE_COVERAGE_PHASE,
        status: "skipped",
        stdout: "_(skipped — previous command failed)_",
        stderr: "",
        exitCode: null,
        durationMs: 0,
      });
    } else {
      const gateResult = await runChangedLineCoverageGate({
        slug,
        cwd,
        coverage,
        baseBranch,
        root,
      });
      phases.push(gateResult);
      if (gateResult.status === "failed") {
        failed = true;
      }
    }
  } else {
    coverageSkipNote =
      "changed-line coverage gate: skipped (`verification.coverage` 未設定)";
  }

  const nonSkipped = phases.filter((p) => p.status !== "skipped");
  const anyFailed = phases.some((p) => p.status === "failed");
  const allSkipped = nonSkipped.length === 0;

  let verdict: "passed" | "failed";
  let errorCode: string | undefined;

  if (allSkipped) {
    verdict = "failed";
    errorCode = "VERIFICATION_NO_RUNNABLE_PHASES";
  } else if (anyFailed) {
    verdict = "failed";
  } else {
    verdict = "passed";
  }

  const result: VerificationResult = {
    slug,
    verdict,
    phases,
    ...(errorCode ? { errorCode } : {}),
  };

  const outputPath = path.join(cwd, verificationResultPath(slug));
  await writeVerificationResult(result, outputPath, cwd, coverageSkipNote);

  return result;
}

/**
 * Phase fallback path: detect and run package.json scripts in order (fail-fast).
 * Existing behavior: build → typecheck → test → lint → security → test-coverage.
 *
 * When baseBranch is provided, checks package.json scripts integrity before running phases.
 * If scripts differ from origin/<baseBranch>, returns a failed result immediately.
 *
 * After all phases, runs the changed-line coverage gate if coverage is declared.
 */
async function runVerificationPhases(
  slug: string,
  cwd: string,
  baseBranch?: string,
  coverage?: import("../../config/schema.js").CoverageConfig,
): Promise<VerificationResult> {
  // Integrity check: detect package.json scripts tampering before running any phases
  if (baseBranch) {
    const integrity = await checkPackageJsonScriptsIntegrity(cwd, baseBranch);
    if (integrity.tampered) {
      const phaseResult: PhaseResult = {
        phase: "package-json-integrity",
        status: "failed",
        stdout: "",
        stderr: integrity.diff ?? "",
        exitCode: null,
        durationMs: 0,
      };
      const result: VerificationResult = {
        slug,
        verdict: "failed",
        phases: [phaseResult],
        errorCode: "PACKAGE_JSON_SCRIPTS_TAMPERED",
      };
      const outputPath = path.join(cwd, verificationResultPath(slug));
      const tamperedCoverageSkipNote =
        coverage === undefined
          ? "changed-line coverage gate: skipped (`verification.coverage` 未設定)"
          : undefined;
      await writeVerificationResult(result, outputPath, cwd, tamperedCoverageSkipNote);
      return result;
    }
  }

  // Detect package manager from cwd to determine the run command for script phases
  const { pm: detectedPm, root } = await detectPackageManager(cwd);
  const toRunCmd = runCommand(detectedPm);

  const phases: PhaseResult[] = [];
  let failed = false;

  for (const phaseName of PHASE_NAMES) {
    // Internal processing phases (not in PHASE_SCRIPTS)
    if (!isScriptPhase(phaseName)) {
      if (failed) {
        // Fail-fast: skip internal phases after first failure
        phases.push({
          phase: phaseName,
          status: "skipped",
          stdout: "",
          stderr: "",
          exitCode: null,
          durationMs: 0,
        });
        continue;
      }

      // TC-016, TC-017, TC-019: run test-coverage as CLI internal processing
      const startMs = Date.now();
      const result = await runTestCoveragePhase(slug, cwd);
      const durationMs = Date.now() - startMs;

      phases.push({
        phase: phaseName,
        status: result.status,
        stdout: result.stdout,
        stderr: "",
        exitCode: result.status === "passed" ? 0 : result.status === "failed" ? 1 : null,
        durationMs,
      });

      if (result.status === "failed") {
        failed = true;
      }
      continue;
    }

    // Script-based phases
    const scriptName = PHASE_SCRIPTS[phaseName];

    // Check if script exists in package.json
    const exists = await scriptExists(scriptName, cwd);
    if (!exists) {
      phases.push({
        phase: phaseName,
        status: "skipped",
        stdout: "",
        stderr: "",
        exitCode: null,
        durationMs: 0,
      });
      continue;
    }

    if (failed) {
      // Fail-fast: skip remaining after first failure
      phases.push({
        phase: phaseName,
        status: "skipped",
        stdout: "",
        stderr: "",
        exitCode: null,
        durationMs: 0,
      });
      continue;
    }

    const startMs = Date.now();
    const [runCmd, ...runArgs] = toRunCmd(scriptName);
    const { exitCode, stdout, stderr } = await spawnScript(runCmd, runArgs, cwd);
    const durationMs = Date.now() - startMs;

    const status = exitCode === 0 ? "passed" : "failed";
    const phaseResult: PhaseResult = { phase: phaseName, status, stdout, stderr, exitCode, durationMs };

    // Detect skipped tests for the test phase (best-effort, non-blocking, phase fallback path only).
    // Runs regardless of pass/fail; never runs for a skipped phase (no script → no output).
    if (phaseName === "test") {
      const combined = [stdout, stderr].filter(Boolean).join("\n");
      const skippedCount = detectSkippedTests(combined);
      if (skippedCount > 0) {
        phaseResult.skippedCount = skippedCount;
      }
    }

    phases.push(phaseResult);

    if (status === "failed") {
      failed = true;
    }
  }

  // Run changed-line coverage gate after all phases.
  let coverageSkipNote: string | undefined;
  if (coverage !== undefined) {
    if (failed) {
      // Fail-fast: prior phases failed — skip the gate.
      phases.push({
        phase: CHANGED_LINE_COVERAGE_PHASE,
        status: "skipped",
        stdout: "_(skipped — previous phase failed)_",
        stderr: "",
        exitCode: null,
        durationMs: 0,
      });
    } else {
      const gateResult = await runChangedLineCoverageGate({
        slug,
        cwd,
        coverage,
        baseBranch,
        root,
      });
      phases.push(gateResult);
      if (gateResult.status === "failed") {
        failed = true;
      }
    }
  } else {
    coverageSkipNote =
      "changed-line coverage gate: skipped (`verification.coverage` 未設定)";
  }

  // Determine verdict: passed only if at least one phase ran and passed, or all non-skipped passed
  const nonSkipped = phases.filter((p) => p.status !== "skipped");
  const anyFailed = phases.some((p) => p.status === "failed");
  const allSkipped = nonSkipped.length === 0;

  let verdict: "passed" | "failed";
  let errorCode: string | undefined;

  if (allSkipped) {
    verdict = "failed";
    errorCode = "VERIFICATION_NO_RUNNABLE_PHASES";
  } else if (anyFailed) {
    verdict = "failed";
  } else {
    verdict = "passed";
  }

  const result: VerificationResult = {
    slug,
    verdict,
    phases,
    ...(errorCode ? { errorCode } : {}),
  };

  // Write result file
  const outputPath = path.join(cwd, verificationResultPath(slug));
  await writeVerificationResult(result, outputPath, cwd, coverageSkipNote);

  return result;
}
