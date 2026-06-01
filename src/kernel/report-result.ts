/**
 * Minimal completion result reported by the agent via report_result tool.
 * ok: true  = normal completion
 * ok: false = agent's voluntary failure declaration (with reason)
 */
export interface BaseReportResult {
  ok: boolean;
  reason?: string;
}
