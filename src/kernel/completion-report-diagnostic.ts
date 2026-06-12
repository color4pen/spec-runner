/**
 * Diagnostic entry recorded when the Codex adapter fails to extract a
 * completion report from the agent's final response.
 * Adapter-populated; absent on the happy path.
 * Added in codex-completion-contract-injection.
 */
export interface CompletionReportDiagnostic {
  /** Which turn phase produced the failure. */
  phase: "main" | "retry";
  /** Retry attempt index (1-origin). Only present for phase === "retry". */
  attempt?: number;
  /** Reason code from tryExtractToolResult. */
  failureReason: string;
  /** Leading fragment of the raw response (≤200 chars + "…"). */
  rawFragment: string;
}
