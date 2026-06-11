/**
 * Shared helpers for fixer step session continuity and findings injection.
 *
 * Design: fixer ステップ（spec-fixer / build-fixer / code-fixer）の
 * session 継続に関する共通ロジックを集約する。
 * Step interface の署名（buildMessage(state, deps)）は変更しない。
 * 各 fixer step の buildMessage 内でこれらの helper を呼び出して自己判定する。
 */
import { STEP_NAMES } from "./step-names.js";
import type { JobState } from "../../state/schema.js";
import type { Finding } from "../../kernel/report-result.js";

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
 * Get the findings from the most recent judge run for the given step.
 * Returns the findings array from the last StepRun's toolResult, or null if:
 * - The step has no runs
 * - The last run has no toolResult (legacy state)
 * - The last run's toolResult has no findings
 */
export function getLatestJudgeFindings(
  state: JobState,
  judgeStepName: string,
): Finding[] | null {
  const runs = state.steps?.[judgeStepName];
  if (!runs || runs.length === 0) return null;
  const lastRun = runs[runs.length - 1];
  if (!lastRun) return null;
  const toolResult = lastRun.outcome.toolResult;
  if (!toolResult) return null;
  const findings = (toolResult as { findings?: Finding[] }).findings;
  if (!findings) return null;
  return findings;
}

/**
 * Build a formatted findings block for embedding in fixer prompts.
 * Groups findings by severity for clear presentation.
 *
 * @param findings     - The findings to format.
 * @param reviewerName - Optional reviewer name for source identification (requirement 7).
 *                       When provided, the header identifies which reviewer produced these findings.
 */
export function buildFindingsBlock(findings: Finding[], reviewerName?: string): string {
  const source = reviewerName ? `${reviewerName} review` : "review";
  const lines: string[] = [`## Findings from ${source}\n`];
  for (const f of findings) {
    const location = f.line !== undefined ? `${f.file}:${f.line}` : f.file;
    lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`- **File**: ${location}`);
    lines.push(`- **Resolution**: ${f.resolution}`);
    lines.push(`- **Rationale**: ${f.rationale}`);
    lines.push(`- **Source**: ${source}`);
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * 継続時の短縮 prompt を生成する。
 * session 内に前回のコンテキストが残っているため、新しい findings パスのみを伝える。
 * findings が提供された場合は findings 本文を埋め込む（findingsPath に依存しない）。
 */
export function buildContinuationMessage(opts: {
  stepName: string;
  findingsPath: string;
  /** @reserved 将来のテンプレート拡張（例: ログ出力やパス解決）のために保持。現在は出力文字列には使用しない。 */
  slug: string;
  findings?: Finding[] | null;
  /** Reviewer name for findings source identification (requirement 7). */
  reviewerName?: string;
}): string {
  // build-fixer は verification（CLI ステップ）からの findings
  // code-fixer は reviewer からの findings (reviewerName で識別)
  const source =
    opts.stepName === STEP_NAMES.BUILD_FIXER
      ? "verification"
      : opts.reviewerName
        ? `${opts.reviewerName} reviewer`
        : "reviewer";

  if (opts.findings && opts.findings.length > 0) {
    const findingsBlock = buildFindingsBlock(opts.findings, opts.reviewerName);
    return `<user-request>
前回の修正に対して ${source} から新しい findings が出ました。

${findingsBlock}

前回のセッションの文脈を踏まえて、上記の findings の指摘事項を修正してください。
前回試みたアプローチで不十分だった箇所は別のアプローチを検討してください。

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
</user-request>`;
  }

  return `<user-request>
前回の修正に対して ${source} から新しい findings が出ました。

新しい findings: ${opts.findingsPath}

前回のセッションの文脈を踏まえて、新しい findings の指摘事項を修正してください。
前回試みたアプローチで不十分だった箇所は別のアプローチを検討してください。

ファイルを worktree に書き出したら end_turn してください。CLI が commit + push を行います。
</user-request>`;
}
