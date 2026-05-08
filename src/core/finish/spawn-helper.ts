/**
 * Helper that wraps spawn → exitCode check → escalation pattern.
 * Eliminates repeated boilerplate across orchestrator.ts and preflight.ts.
 */
import type { SpawnFn } from "../../util/spawn.js";
import { formatEscalation } from "./escalation.js";

export type SpawnOrEscalateResult =
  | { ok: true; stdout: string; stderr: string }
  | { ok: false; escalation: string };

/**
 * Spawn a command and return a structured result.
 * On exitCode === 0 → { ok: true, stdout, stderr }
 * On exitCode !== 0 → { ok: false, escalation } with auto-constructed detectedState
 */
export async function spawnOrEscalate(params: {
  spawn: SpawnFn;
  cmd: string;
  args: string[];
  cwd: string;
  failedStep: string;
  resumeCommand: string;
  /** Override default recommended action (default: stderr + resumeCommand) */
  recommendedAction?: string;
}): Promise<SpawnOrEscalateResult> {
  const { spawn, cmd, args, cwd, failedStep, resumeCommand, recommendedAction } = params;

  const result = await spawn(cmd, args, { cwd });

  if (result.exitCode === 0) {
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  }

  const argsStr = args.join(" ");
  const detectedState = argsStr
    ? `${cmd} ${argsStr} failed (exit ${result.exitCode})`
    : `${cmd} failed (exit ${result.exitCode})`;

  const action =
    recommendedAction ??
    `Check error: ${result.stderr.trim()}. Then re-run: ${resumeCommand}`;

  return {
    ok: false,
    escalation: formatEscalation({
      failedStep,
      detectedState,
      recommendedAction: action,
      resumeCommand,
    }),
  };
}
