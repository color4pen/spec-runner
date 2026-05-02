/**
 * Escalation formatter for finish command.
 * TC-023: formatEscalation must include 4 required fields:
 *   failedStep, detectedState, recommendedAction, resumeCommand
 */

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
