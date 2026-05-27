/**
 * Branch checkout helpers for the finish command.
 *
 * Responsibilities:
 *   - checkoutForValidation: Record current branch, fetch + checkout feature branch
 *   - restoreBranch: Restore the previously recorded branch (warning on failure)
 */
import type { SpawnFn } from "../../util/spawn.js";
import { spawnOrEscalate } from "./spawn-helper.js";
import { formatEscalation } from "./escalation.js";
import { stderrWrite } from "../../logger/stdout.js";

export interface CheckoutForValidationInput {
  branch: string;
  cwd: string;
  spawn: SpawnFn;
}

export type CheckoutForValidationResult =
  | { ok: true; originalBranch: string }
  | { ok: false; escalation: string };

/**
 * Record the current branch, fetch the feature branch, and check it out.
 * Used before Check 5 so that preflight runs in the feature branch.
 */
export async function checkoutForValidation(
  input: CheckoutForValidationInput,
): Promise<CheckoutForValidationResult> {
  const { branch, cwd, spawn } = input;

  // Get current branch name via spawnOrEscalate
  const revParseResult = await spawnOrEscalate({
    spawn,
    cmd: "git",
    args: ["rev-parse", "--abbrev-ref", "HEAD"],
    cwd,
    failedStep: "Phase 0 (branch checkout for validation)",
    resumeCommand: "specrunner finish",
    recommendedAction: "git コマンドが正常に動作しているか確認してください。",
  });

  if (!revParseResult.ok) {
    return { ok: false, escalation: revParseResult.escalation };
  }
  const originalBranch = revParseResult.stdout.trim();

  // Fetch the feature branch from remote (best-effort; ignore failures)
  await spawn("git", ["fetch", "origin", branch], { cwd });

  // Try to checkout the feature branch
  const checkoutResult = await spawn("git", ["checkout", branch], { cwd });
  if (checkoutResult.exitCode !== 0) {
    // Attempt to create a local tracking branch (managed mode)
    const checkoutBResult = await spawn(
      "git",
      ["checkout", "-b", branch, `origin/${branch}`],
      { cwd },
    );
    if (checkoutBResult.exitCode !== 0) {
      return {
        ok: false,
        escalation: formatEscalation({
          failedStep: "Phase 0 (branch checkout for validation)",
          detectedState: `git checkout ${branch} failed: ${checkoutBResult.stderr.trim()}`,
          recommendedAction: `feature branch への checkout に失敗しました。branch "${branch}" が存在するか確認してください。`,
          resumeCommand: "specrunner finish",
        }),
      };
    }
  }

  return { ok: true, originalBranch };
}

export interface RestoreBranchInput {
  originalBranch: string;
  cwd: string;
  spawn: SpawnFn;
  /** Warning output function (defaults to process.stderr.write). */
  warnFn?: (msg: string) => void;
}

/**
 * Restore the previously recorded branch.
 * Failures are reported as warnings only (not escalation).
 */
export async function restoreBranch(input: RestoreBranchInput): Promise<void> {
  const { originalBranch, cwd, spawn } = input;
  const warn = input.warnFn ?? stderrWrite;
  const result = await spawn("git", ["checkout", originalBranch], { cwd });
  if (result.exitCode !== 0) {
    warn(
      `Warning: failed to restore branch "${originalBranch}": ${result.stderr.trim()}\n`,
    );
  }
}
