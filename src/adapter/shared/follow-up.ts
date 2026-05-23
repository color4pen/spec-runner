import type { AgentRunContext, AgentRunResult } from "../../core/port/agent-runner.js";

/**
 * follow turn を実行すべきか判定する。
 * ctx.followUpPrompts が 1 件以上かつ作業 turn が success なら true。
 *
 * Design: shared は runtime 型 (AsyncGenerator / Turn / poll result) と
 * usage 意味論を知らない純粋ロジックのみ。
 */
export function shouldRunFollowUp(
  ctx: Pick<AgentRunContext, "followUpPrompts">,
  baseCompletionReason: AgentRunResult["completionReason"],
): boolean {
  return (ctx.followUpPrompts?.length ?? 0) > 0 && baseCompletionReason === "success";
}

/**
 * follow turn の resultContent を base result にマージする。
 * sessionId は base (turn 1) を維持。resultContent は follow turn を採用。
 * modelUsage は呼び出し元 (adapter) が native で算出済みのものを base に反映してから呼ぶ。
 *
 * Design: adapter → shared 純粋関数の一方向依存。
 */
export function mergeFollowUpResult(
  baseResult: AgentRunResult,
  followUpResultContent: string | null,
): AgentRunResult {
  return {
    ...baseResult,
    resultContent: followUpResultContent,
  };
}
