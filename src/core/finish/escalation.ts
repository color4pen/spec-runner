/**
 * Escalation formatter for finish command.
 * TC-023: formatEscalation must include 4 required fields:
 *   failedStep, detectedState, recommendedAction, resumeCommand
 */
import type { NormalizedPrState } from "./types.js";

export interface EscalationParams {
  failedStep: string;
  detectedState: string;
  recommendedAction: string;
  resumeCommand: string;
}

/**
 * Format an escalation block for stdout output.
 * All 4 fields are required and will always appear in the output.
 */
export function formatEscalation(params: EscalationParams): string {
  return [
    "=== specrunner finish: escalation ===",
    "",
    `Failed Step:       ${params.failedStep}`,
    `Detected State:    ${params.detectedState}`,
    `Recommended Action:`,
    `  ${params.recommendedAction}`,
    "",
    `Resume Command:    ${params.resumeCommand}`,
    "",
    "=====================================",
  ].join("\n");
}

/**
 * Get the recommended action string for a given PR state.
 */
export function getRecommendedAction(state: NormalizedPrState, jobId: string, force: boolean): string {
  switch (state) {
    case "OPEN_BEHIND":
      return `Rebase the feature branch onto main, then re-run:\n  git checkout <branch> && git rebase origin/main && git push --force-with-lease`;
    case "OPEN_CONFLICTS":
      return `Resolve merge conflicts on the feature branch, then re-run:\n  git checkout <branch> && git merge origin/main  (or rebase)`;
    case "OPEN_CHECKS_FAILING":
      if (force) {
        return `Check the GitHub PR page for failing CI details. Fix the issues or run:\n  specrunner finish ${jobId} --force  (skips check requirements via --admin)`;
      }
      return `Wait for CI checks to pass, or use --force to bypass:\n  specrunner finish ${jobId} --force`;
    case "MERGED":
      return `Feature PR is already merged. Run without --cleanup-only to proceed with archive steps.`;
    case "CLOSED":
      return `The PR was closed (not merged). Use 'specrunner cancel' to mark the job as cancelled.`;
    case "OPEN_MERGEABLE":
      return `The PR appears mergeable. Retry the finish command.`;
    default: {
      const _exhaustive: never = state;
      return `Unknown state: ${_exhaustive}. Check the PR manually on GitHub.`;
    }
  }
}
