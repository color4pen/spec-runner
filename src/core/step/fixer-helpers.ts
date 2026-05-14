/**
 * Shared helpers for fixer step session continuity.
 *
 * Design: fixer ステップ（spec-fixer / build-fixer / code-fixer）の
 * session 継続に関する共通ロジックを集約する。
 * Step interface の署名（buildMessage(state, deps)）は変更しない。
 * 各 fixer step の buildMessage 内でこれらの helper を呼び出して自己判定する。
 */
import { STEP_NAMES } from "./step-names.js";
import type { JobState } from "../../state/schema.js";

/** fixer ステップ名の集合 */
export const FIXER_STEP_NAMES: ReadonlySet<string> = new Set([
  STEP_NAMES.SPEC_FIXER,
  STEP_NAMES.BUILD_FIXER,
  STEP_NAMES.CODE_FIXER,
]);

/**
 * 前回の fixer session ID を取得する。
 * 初回実行（前回 run なし）または前回 sessionId が null の場合は null を返す。
 */
export function getPreviousSessionId(
  state: JobState,
  stepName: string,
): string | null {
  const runs = state.steps?.[stepName];
  if (!runs || runs.length === 0) return null;
  const lastRun = runs[runs.length - 1];
  return lastRun?.sessionId ?? null;
}

/**
 * session 継続判定。前回の run が存在し sessionId が非 null であれば true。
 */
export function isFixerContinuation(
  state: JobState,
  stepName: string,
): boolean {
  return getPreviousSessionId(state, stepName) !== null;
}

/**
 * 継続時の短縮 prompt を生成する。
 * session 内に前回のコンテキストが残っているため、新しい findings パスのみを伝える。
 */
export function buildContinuationMessage(opts: {
  stepName: string;
  findingsPath: string;
  /** @reserved 将来のテンプレート拡張（例: ログ出力やパス解決）のために保持。現在は出力文字列には使用しない。 */
  slug: string;
}): string {
  // build-fixer は verification（CLI ステップ）からの findings、それ以外は reviewer からの findings
  const STEP_NAMES_BUILD_FIXER = "build-fixer";
  const source =
    opts.stepName === STEP_NAMES_BUILD_FIXER ? "verification" : "reviewer";
  return `<user-request>
前回の修正に対して ${source} から新しい findings が出ました。

新しい findings: ${opts.findingsPath}

前回のセッションの文脈を踏まえて、新しい findings の指摘事項を修正してください。
前回試みたアプローチで不十分だった箇所は別のアプローチを検討してください。

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
</user-request>`;
}
