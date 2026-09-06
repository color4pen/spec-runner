/**
 * Shared helpers for fixer step session continuity and findings injection.
 *
 * Design: fixer ステップ（spec-fixer / code-fixer）の
 * session 継続に関する共通ロジックを集約する。
 * Step interface の署名（buildMessage(state, deps)）は変更しない。
 * 各 fixer step の buildMessage 内でこれらの helper を呼び出して自己判定する。
 *
 * build-fixer は廃止済み。verification 失敗は implementer への再入で直す。
 */
import { STEP_NAMES } from "./step-names.js";
import type { JobState } from "../../state/schema.js";
import type { Finding } from "../../kernel/report-result.js";
import type { OutputContract } from "../port/output-contract.js";
import type { StepDeps } from "./types.js";

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------
export { getLatestJudgeFindings, getConformanceFixContext } from "../review-routing.js";

/** fixer ステップ名の集合（build-fixer は廃止済み — verification 失敗は implementer 再入で直す） */
export const FIXER_STEP_NAMES: ReadonlySet<string> = new Set([
  STEP_NAMES.SPEC_FIXER,
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
 * Build a formatted findings block for embedding in fixer prompts.
 * Groups findings by severity for clear presentation.
 * When any finding has a remediation contract, expands it inline and adds
 * an all-sites simultaneous fix directive at the end of the block.
 *
 * Legacy behavior (no remediation): output is identical to the previous implementation.
 *
 * @param findings     - The findings to format.
 * @param reviewerName - Optional reviewer name for source identification (requirement 7).
 *                       When provided, the header identifies which reviewer produced these findings.
 */
export function buildFindingsBlock(findings: Finding[], reviewerName?: string): string {
  const source = reviewerName ? `${reviewerName} review` : "review";
  const lines: string[] = [`## Findings from ${source}\n`];
  let hasRemediation = false;
  for (const f of findings) {
    const location = f.line !== undefined ? `${f.file}:${f.line}` : f.file;
    lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`);
    lines.push(`- **File**: ${location}`);
    lines.push(`- **Resolution**: ${f.resolution}`);
    lines.push(`- **Rationale**: ${f.rationale}`);
    lines.push(`- **Source**: ${source}`);
    if (f.remediation) {
      hasRemediation = true;
      lines.push(`- **Invariant**: ${f.remediation.invariant}`);
      lines.push(`- **Sites (fix all in this iteration)**:`);
      for (const site of f.remediation.sites) {
        const siteLoc = site.line !== undefined ? `${site.file}:${site.line}` : site.file;
        lines.push(`  - ${siteLoc}`);
      }
      lines.push(`- **Approach**: ${f.remediation.approach}`);
    }
    lines.push("");
  }
  if (hasRemediation) {
    lines.push("**全 site 同時修正指令**: 列挙された全 site を同一イテレーションで修正すること。approach より狭い修正を選ぶ場合は、その理由を出力（evidence）に残すこと。");
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Build an evidence reference block listing result file paths.
 * Used in fixer prompts to point the agent to the reviewer's evidence files.
 *
 * Returns an empty string when paths is empty.
 * Returns a formatted block when 1 or more paths are provided.
 * Includes a note that the files are read-only references — not for machine parse or modification.
 */
export function renderEvidenceReference(paths: string[]): string {
  if (paths.length === 0) return "";
  const pathLines = paths.map((p) => `- ${p}`).join("\n");
  return `\n**Evidence file reference** （参照用。機械 parse はしない。この file は読み取り専用 — 書き換えない）:\n${pathLines}\n`;
}

/**
 * Build the outputContracts array for an unpushable-path contract.
 *
 * Returns an empty array when deps.pushCapability is null, undefined, or has no patterns.
 * Returns a single "unpushable-path" contract with policy "follow-up" when patterns are declared.
 *
 * This mirrors the contract block in implementer.ts and is shared by fixer steps
 * (code-fixer, spec-fixer) to avoid duplicating the contract logic.
 */
export function buildUnpushablePathContracts(deps: StepDeps): OutputContract[] {
  if (!deps.pushCapability || deps.pushCapability.patterns.length === 0) return [];
  return [
    {
      kind: "unpushable-path",
      path: "", // sentinel — path is not used for unpushable-path contracts
      policy: "follow-up",
      patterns: deps.pushCapability.patterns,
    },
  ];
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
  /**
   * Evidence result file paths to surface to the fixer agent.
   * When provided, overrides the default [findingsPath] used for evidence reference rendering.
   * When absent, falls back to [findingsPath].
   */
  findingsPaths?: string[];
}): string {
  // code-fixer は reviewer からの findings (reviewerName で識別)
  const source = opts.reviewerName
    ? `${opts.reviewerName} reviewer`
    : "reviewer";

  // Resolve evidence paths: explicit findingsPaths takes precedence, else [findingsPath].
  const evidencePaths = opts.findingsPaths ?? [opts.findingsPath];

  if (opts.findings && opts.findings.length > 0) {
    const findingsBlock = buildFindingsBlock(opts.findings, opts.reviewerName);
    const evidenceRef = renderEvidenceReference(evidencePaths);
    return `<user-request>
前回の修正に対して ${source} から新しい findings が出ました。

${findingsBlock}
${evidenceRef}
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
