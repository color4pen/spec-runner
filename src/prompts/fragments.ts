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

// ---------------------------------------------------------------------------
// Cross-step evidence and classification discipline (T-01)
// ---------------------------------------------------------------------------

/**
 * Evidence discipline — common to ALL agent steps.
 * Single source of truth for evidence classification, unverified enumeration,
 * empty-set reporting, and numeric parameter attestation.
 *
 * Do NOT include severity definitions here (those live in judge-rules.ts).
 */
export const EVIDENCE_DISCIPLINE = `**Evidence Discipline** — 全 step 共通の根拠規律:

出力中の主張は根拠区分を持つ:
- **verified**: 実測。確認に使ったコマンド / file:line を引用できる
- **derived**: 上流成果物からの導出。出典を引用できる
- **unverified**: 未確認

**Unverified 列挙義務**: unverified の主張は明示列挙する。無い場合は「None」と明記する。沈黙の省略は禁止。

**空集合は判定不能**: 検査対象が空集合・全 skip だった検査は「合格」ではなく「判定不能」として報告する。

**数値パラメータ**: timeout / limit / threshold 等の数値提案は verified（実測）か unverified（根拠なし）のいずれかであり、類推（「他の値と同等でよいはず」）は unverified として申告する。`;

/**
 * Cause classification — embedded in the Completion section of all agent steps.
 * Classifies the cause of failures, escalations, and decision-needed reports.
 * This is evidence report discipline; typed schema is NOT changed.
 *
 * Defined before COMPLETION_DIRECTIVE so it can be embedded in the directive (D3).
 */
export const CAUSE_CLASSIFICATION = `**Cause Classification** — 失敗・escalation・decision-needed の報告時に原因分類を付す:

- \`request-gap\`: request の不足・曖昧さ
- \`derivation-gap\`: 上流成果物からの導出漏れ
- \`implementation-defect\`: 実装の欠陥
- \`harness-defect\`: pipeline / CLI 側の問題
- \`operational\`: 運用・環境の問題

これは evidence report の記述規律であり、typed schema の変更は行わない。`;

/**
 * Provider-neutral completion directive for producer-step system prompt footers.
 * Replaces the old `report_result` tool-specific footer.
 * Includes CAUSE_CLASSIFICATION at the end per D3 (CAUSE_CLASSIFICATION は ## Completion 内).
 * Composed from COMPLETION_REPORT_LINE, COMPLETION_NO_EARLY_STOP_LINE, and CAUSE_CLASSIFICATION.
 */
export const COMPLETION_DIRECTIVE = `## Completion

${COMPLETION_REPORT_LINE}
- 正常完了: \`{ok: true}\`
- 自発的失敗（実行不能等）: \`{ok: false, reason: "理由"}\`

${COMPLETION_NO_EARLY_STOP_LINE}

${CAUSE_CLASSIFICATION}`;

/**
 * Coverage gate integrity — single source for both build-fixer and code-fixer.
 * Prohibits any form of coverage gate evasion.
 *
 * Single source of truth — do NOT duplicate this text in individual prompt files.
 */
export const COVERAGE_GATE_INTEGRITY = `**Coverage Gate Integrity** — coverage gate 回避禁止:

- **テストの削除・移設**: 既存テストを削除・移設してカバレッジを維持することは禁止
- **dead code / dead export の追加**: カバレッジ目的の dead code または dead export の追加は禁止
- **coverage 設定（include / exclude / threshold）の編集**: coverage 設定を緩める変更は禁止`;
