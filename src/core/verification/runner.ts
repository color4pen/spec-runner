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
import * as path from "node:path";
import { PHASE_NAMES, PHASE_SCRIPTS } from "./phases.js";
import type { PhaseName, ScriptPhaseName } from "./phases.js";
import { runTestCoveragePhase } from "./test-coverage.js";
import { verificationResultPath } from "../../util/paths.js";
import { normalizeCommands, spawnCommand } from "./commands.js";
import type { VerificationConfig } from "../../config/schema.js";

/** Result for a single verification phase. */
export interface PhaseResult {
  /** Phase name or command label used for display. */
  phase: string;
  status: "passed" | "failed" | "skipped";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
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
 * (i.e. it has an entry in PHASE_SCRIPTS and runs via `bun run <script>`).
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
 * Spawn `bun run <script>` and collect stdout/stderr.
 * Returns the exit code and collected output.
 */
function spawnScript(
  script: string,
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("bun", ["run", script], {
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
 */
async function writeVerificationResult(
  result: VerificationResult,
  outputPath: string,
): Promise<void> {
  const iterNum = 1; // iteration number placeholder; caller provides full path
  const lines: string[] = [];

  lines.push(`# Verification Result — ${result.slug} — iter ${iterNum}`);
  lines.push("");
  lines.push(`## Verdict: ${result.verdict}`);
  lines.push("");

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
  await fs.writeFile(outputPath, lines.join("\n"), "utf-8");
}

/**
 * Run verification for the given slug.
 *
 * Two execution paths:
 * 1. **commands path**: when verificationConfig.commands is defined, executes each command via
 *    `sh -c <command>` in order (fail-fast). Language-agnostic.
 * 2. **phase fallback path**: when commands is undefined, detects and runs package.json scripts
 *    (build → typecheck → test → lint → security → test-coverage) via `bun run <script>`.
 *
 * Writes verification-result.md to the change folder.
 *
 * @param slug - Change slug (used for output path and result title)
 * @param cwd - Working directory (defaults to process.cwd())
 * @param verificationConfig - Optional verification config from project local config
 */
export async function runVerification(
  slug: string,
  cwd: string = process.cwd(),
  verificationConfig?: VerificationConfig,
): Promise<VerificationResult> {
  // Dispatch to commands path if verification.commands is defined
  if (verificationConfig?.commands !== undefined) {
    return runVerificationCommands(slug, cwd, verificationConfig.commands);
  }

  // Fallback: phase detection path (existing behavior)
  return runVerificationPhases(slug, cwd);
}

/**
 * Commands path: execute user-defined commands in order (fail-fast).
 * Each command is run via `sh -c <command>`.
 */
async function runVerificationCommands(
  slug: string,
  cwd: string,
  rawCommands: import("../../config/schema.js").VerificationCommand[],
): Promise<VerificationResult> {
  const normalized = normalizeCommands(rawCommands);
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
    const { exitCode, stdout, stderr } = await spawnCommand(cmd.run, cwd);
    const durationMs = Date.now() - startMs;

    const status = exitCode === 0 ? "passed" : "failed";
    phases.push({ phase: label, status, stdout, stderr, exitCode, durationMs });

    if (status === "failed") {
      failed = true;
    }
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
  await writeVerificationResult(result, outputPath);

  return result;
}

/**
 * Phase fallback path: detect and run package.json scripts in order (fail-fast).
 * Existing behavior: build → typecheck → test → lint → security → test-coverage.
 */
async function runVerificationPhases(
  slug: string,
  cwd: string,
): Promise<VerificationResult> {
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
    const { exitCode, stdout, stderr } = await spawnScript(scriptName, cwd);
    const durationMs = Date.now() - startMs;

    const status = exitCode === 0 ? "passed" : "failed";
    phases.push({ phase: phaseName, status, stdout, stderr, exitCode, durationMs });

    if (status === "failed") {
      failed = true;
    }
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
  await writeVerificationResult(result, outputPath);

  return result;
}
