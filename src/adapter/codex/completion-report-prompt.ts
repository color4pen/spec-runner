/**
 * Single-source completion-report prompt clauses for the Codex adapter.
 *
 * Design (#661): means clause is adapter's responsibility, not shared prompts.
 * This module is the single source of truth for the exact wording injected into
 * the main work turn and the follow-up retry turns.
 */

/**
 * Means clause for completion reporting.
 * Shared byte-for-byte between the main-turn injection and the retry prompts.
 */
export const COMPLETION_REPORT_MEANS =
  "コードフェンスや説明文を付けず、スキーマに一致する JSON オブジェクトのみを返してください。";

/**
 * Instruction appended to the main work turn when reportTool is set.
 * Wraps COMPLETION_REPORT_MEANS with a completion-intent preamble.
 */
export function buildMainTurnCompletionInstruction(): string {
  return `このステップの作業が完了したら、最終応答として、${COMPLETION_REPORT_MEANS}`;
}

/**
 * Prompt for a follow-up retry turn when JSON extraction from the previous
 * response failed. Byte-for-byte identical to the previously inlined literal.
 */
export function buildCompletionRetryPrompt(attempt: number, maxAttempts: number): string {
  return `前の応答から JSON を取得できませんでした。${COMPLETION_REPORT_MEANS} (attempt ${attempt}/${maxAttempts})`;
}
