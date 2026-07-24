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
import { deriveImplFixerChain, resolveActiveReviewer } from "../pipeline/reviewer-chain.js";

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
 * Resolve the predecessor step name for conformance recency checking.
 *
 * When conformance routes to a fixer, the fixer's "predecessor" (last step that ran
 * in the normal flow before conformance) differs per fixer:
 *   - code-fixer: the active reviewer (code-review or custom reviewer)
 *   - spec-fixer: spec-review
 *   - implementer: implementer itself (its previous run)
 */
function conformancePredecessorStep(state: JobState, stepName: string): string {
  if (stepName === STEP_NAMES.CODE_FIXER) {
    return resolveActiveReviewer(state, deriveImplFixerChain(state));
  }
  if (stepName === STEP_NAMES.SPEC_FIXER) {
    return STEP_NAMES.SPEC_REVIEW;
  }
  // implementer: predecessor is itself (its most recent prior run)
  return STEP_NAMES.IMPLEMENTER;
}

/**
 * Get conformance findings for injection into a fixer step context.
 *
 * Returns the findings from the latest conformance run if:
 * 1. Conformance has run and has a `needs-fix:<target>` verdict matching stepName
 * 2. The conformance run is more recent than the predecessor step's last run
 *    (ensures we only inject when conformance triggered this fixer entry)
 * 3. The conformance run has findings in toolResult
 *
 * Returns null in all other cases (no conformance run, stale conformance, wrong target,
 * predecessor ran after conformance indicating a normal non-conformance entry).
 *
 * Pure function — no I/O.
 */
export function getConformanceFixContext(state: JobState, stepName: string): Finding[] | null {
  // Step 1: get latest conformance run
  const conformanceRuns = state.steps?.[STEP_NAMES.CONFORMANCE];
  if (!conformanceRuns || conformanceRuns.length === 0) return null;
  const latestConformance = conformanceRuns[conformanceRuns.length - 1];
  if (!latestConformance) return null;

  // Step 2: check verdict is needs-fix:<target> for this stepName
  const verdict = latestConformance.outcome.verdict;
  if (typeof verdict !== "string") return null;
  const needsFixPrefix = "needs-fix:";
  if (!verdict.startsWith(needsFixPrefix)) return null;
  const target = verdict.slice(needsFixPrefix.length);
  if (target !== stepName) return null;

  // Step 3: recency — conformance must be newer than the predecessor's last run.
  //
  // LOAD-BEARING: the inclusive `>=` is intentional. In production the pipeline
  // executes steps sequentially, so conformance.endedAt is always strictly greater
  // than predecessor.endedAt. The `>=` correctly handles that case AND also
  // returns null for the degenerate equal-timestamp state.
  //
  // INVARIANT for callers that depend on this function as a conformance-entry guard
  // (e.g. specFixerForwardsToTestGen in spec-observation.ts): test fixtures that
  // represent a conformance-triggered entry MUST use distinct, ordered timestamps
  // (predecessor.endedAt < conformance.endedAt) AND must provide toolResult.findings
  // (step 4) for the function to return non-null. Fixtures with equal timestamps will
  // produce a false null (not-a-conformance-entry) result via this step.
  const predecessorName = conformancePredecessorStep(state, stepName);
  const predecessorRuns = state.steps?.[predecessorName];
  if (predecessorRuns && predecessorRuns.length > 0) {
    const latestPredecessor = predecessorRuns[predecessorRuns.length - 1];
    if (latestPredecessor && latestPredecessor.endedAt >= latestConformance.endedAt) {
      // Predecessor ran after (or at the same time as) conformance → not a conformance-triggered entry
      return null;
    }
  }

  // Step 4: return findings from toolResult.
  //
  // NOTE: callers that use the non-null return value solely as a boolean guard
  // (e.g. specFixerForwardsToTestGen) depend on this step returning non-null.
  // Test fixtures must therefore populate toolResult.findings on the conformance
  // StepRun to correctly simulate a conformance-triggered entry.
  const toolResult = latestConformance.outcome.toolResult;
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
