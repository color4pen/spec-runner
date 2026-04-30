/**
 * Verification runner — spawns package.json scripts and collects results.
 * Uses node:child_process.spawn (NOT bun:* / Bun.*) per project rules.
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PHASE_NAMES, PHASE_SCRIPTS } from "./phases.js";
import type { PhaseName } from "./phases.js";

/** Result for a single verification phase. */
export interface PhaseResult {
  phase: PhaseName;
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
      env: process.env,
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
      lines.push("_(skipped — script not found in package.json)_");
    } else {
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
 * Run all verification phases for the given slug.
 * Executes phases in order (fail-fast): build → typecheck → test → lint → security.
 * If a phase fails, remaining phases are skipped.
 * Writes verification-result.md to the change folder.
 *
 * @param slug - Change slug (used for output path and result title)
 * @param cwd - Working directory (defaults to process.cwd())
 */
export async function runVerification(
  slug: string,
  cwd: string = process.cwd(),
): Promise<VerificationResult> {
  const phases: PhaseResult[] = [];
  let failed = false;

  for (const phaseName of PHASE_NAMES) {
    const scriptName = PHASE_SCRIPTS[phaseName];

    // Check if script exists
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
  const outputPath = path.join(cwd, "openspec", "changes", slug, "verification-result.md");
  await writeVerificationResult(result, outputPath);

  return result;
}
