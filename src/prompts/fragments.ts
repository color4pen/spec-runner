/**
 * Shared prompt fragments for system prompts.
 *
 * Single source of truth for cross-step prompt rules that remain as fragments.
 * Each fragment is a plain string; no metadata or registry abstraction.
 *
 * Dependency direction: prompt files → fragments (one-way).
 * Fragment files do not know which prompts use them.
 *
 * NOTE: SPEC_RUNNER_COMMON_CONTEXT, AUTHORITY_SPEC_GUARD, and SPEC_FORMAT
 * have been moved to specrunner/rules.md. Agents read rules.md via Read tool
 * (identity priming) rather than receiving it as a static system prompt fragment.
 */

/** Prevents agents from running git commands (commit / push). */
export const COMMIT_DISCIPLINE = `## git operations

あなたは file edit のみ行ってください。\`git add\` / \`git commit\` / \`git push\` の実行は禁止です。
commit / push は pipeline executor が一括で行います。違反して自主 commit してしまっても pipeline は halt せず agent commit を許容しますが、commit message format が pipeline 規定 (\`<step>: <slug>\`) から外れて履歴が読みづらくなるため、必ず file edit のみで完了してください。
`;

import { VERDICT_BLOCKING_RULES } from "./judge-rules.js";

/** Pipeline review rules (categories / verdict / verdict blocking rules). */
export const PIPELINE_RULES = `${VERDICT_BLOCKING_RULES}

## Categories

レビュー対象の観点を以下のカテゴリに統一する。

| Category | 評価観点 |
|----------|---------|
| correctness | ロジック、仕様準拠、境界条件、edge case |
| security | 脆弱性、認証・認可、入力検証、OWASP Top 10 |
| architecture | 設計パターン、責務分離、依存方向 |
| performance | クエリ、メモリ、レスポンス、N+1、バンドルサイズ |
| maintainability | 可読性、テスタビリティ、命名、コメント |
| testing | 網羅性、テスト品質、Scenario Coverage |
| completeness | 仕様の網羅性、要件の充足 |
| consistency | 既存 spec との整合性、後方互換性、用語統一 |
| feasibility | 実現可能性、依存関係、工数見積 |

## Verdict

全レビューエージェントは以下の 3 値を typed findings から導出する（CLI が決定的に集計）。

| Verdict | 条件 | 次のアクション |
|---------|------|--------------|
| \`approved\` | blocking な findings がない | 次ステップへ |
| \`needs-fix\` | critical または high の finding が 1 件以上 | fixer エージェントで修正 → 再レビュー |
| \`escalation\` | decision-needed の finding が 1 件以上、またはリトライ上限超過 | ユーザーに報告・判断を仰ぐ |`;

// ---------------------------------------------------------------------------
// Provider-neutral completion contract tokens (D1 / D2 in design.md)
// ---------------------------------------------------------------------------

/** Completion report instruction (provider-neutral). */
export const COMPLETION_REPORT_LINE = `作業が完了したら、完了結果を報告してください。`;

/** Anti-early-stop instruction (provider-neutral). */
export const COMPLETION_NO_EARLY_STOP_LINE = `完了結果を報告せずに作業を終えないでください。`;

/**
 * Provider-neutral completion directive for producer-step system prompt footers.
 * Replaces the old `report_result` tool-specific footer.
 * Composed from COMPLETION_REPORT_LINE and COMPLETION_NO_EARLY_STOP_LINE.
 */
export const COMPLETION_DIRECTIVE = `## Completion

${COMPLETION_REPORT_LINE}
- 正常完了: \`{ok: true}\`
- 自発的失敗（実行不能等）: \`{ok: false, reason: "理由"}\`

${COMPLETION_NO_EARLY_STOP_LINE}`;
