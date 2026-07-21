/**
 * Shared judge rule constants.
 *
 * Single source of truth for:
 * - DECISION_NEEDED_DEFINITION: when to assign the `decision-needed` resolution
 * - VERDICT_BLOCKING_RULES: blocking conditions (findings-derived by CLI)
 * - SEVERITY_DEFINITION: standard severity levels for all judge prompts
 * - REQUEST_REVIEW_SEVERITY_DEFINITION: request-review scoped severity levels
 * - OBSERVATION_DEFINITION: when to use the `observations` array
 *
 * All judge-step prompts and result templates import from this module.
 * This module has no project-internal imports (leaf — no circular dependencies).
 */

/**
 * Resolution `decision-needed` bullet point for judge prompt "Resolution 定義" sections.
 *
 * Limited to items only the request author can decide.
 * Requires at least two structured options with label and consequence.
 * Designed to replace the `- \`decision-needed\`: ...` line in each prompt's Resolution block.
 */
export const DECISION_NEEDED_DEFINITION =
`- \`decision-needed\`: **request 作成者でなければ決められない事項に限る**。
  - 該当例: 要件同士の矛盾 / 複数の妥当な選択肢があり作成者の意図が必要 / 前提となる文脈の不足
  - 非該当例: 実装者が選べる技術判断 / 推奨改善 / ドキュメント追記の提案 → これらは \`fixable\` と適切な severity で表現する
  - 迷った場合は \`fixable\` に倒す
  - **必須**: \`options\` に 2 件以上の選択肢を記載すること。各選択肢は \`{ label: string; consequence: string }\` の形式。
    選択肢を 2 件以上書けない場合、その指摘は \`decision-needed\` ではなく \`fixable\` として報告する。
  - 例: \`options: [{ label: "A: 現行 API を維持", consequence: "後方互換を保てるが新機能が遅れる" }, { label: "B: API を刷新", consequence: "移行コストが発生するが長期的に保守性が向上する" }]\``;

/**
 * Standard severity level definitions for all judge prompts (code-review, spec-review,
 * regression-gate, custom-reviewer, conformance).
 *
 * Single source of truth — inject via `${SEVERITY_DEFINITION}` in Completion sections.
 * Do NOT hardcode these bullet points in individual prompt files.
 */
export const SEVERITY_DEFINITION =
`**Severity 定義**:
- \`critical\`: 本番障害、データ損失、セキュリティ侵害に直結
- \`high\`: 機能不全、明確なバグ、回避策なし
- \`medium\`: 品質低下、保守性問題、将来のリスク
- \`low\`: 情報提供、スタイル、微小な改善`;

/**
 * Severity level definitions scoped to the request-review step.
 *
 * Single source of truth — inject via `${REQUEST_REVIEW_SEVERITY_DEFINITION}` in request-review
 * prompt Output Format sections. Do NOT hardcode these bullet points in request-review-system.ts.
 */
export const REQUEST_REVIEW_SEVERITY_DEFINITION =
`**Severity 定義**（request-review スコープ）:
- \`high\`: リクエストレベルの欠陥（目標が不明確、受け入れ基準が未テスト、外部制約が未指定、現状コード断定と実コードの不一致）
- \`medium\`: スコープの曖昧さ、推奨追加
- \`low\`: 明確さの改善、表現の改良`;

/**
 * Definition of `observations` for use in judge step prompts.
 *
 * Paired with DECISION_NEEDED_DEFINITION — inject both wherever findings/resolution
 * guidance is provided.
 *
 * Key invariants encoded in this definition:
 * - observations are informational records; verdict routing ignores them entirely
 * - a problem that can be reproduced with steps is a finding, not an observation
 */
export const OBSERVATION_DEFINITION =
`- \`observations\` 配列（省略可）: **対応不要だが記録すべき観察**。verdict には影響しない。
  - 形式: \`{ severity, file, line?, title, rationale }\`（\`resolution\` フィールドなし）
  - severity は記録用であり、routing・fixer・台帳照合には一切使われない
  - **再現手順を構成できる問題を observation に入れることは禁止** — それは \`finding\` として報告する
  - 置き場の判断基準:
    - 指摘対応が必要 → \`finding\`（resolution: fixable / decision-needed）
    - 対応不要・既知リスク・設計文書記載済み → \`observation\`
    - 迷った場合は \`finding\` に倒す（observation への誘導を優先しない）`;

/**
 * Verdict blocking rules for use in prompts and pipeline rules.
 *
 * Describes:
 * - decision-needed ≥ 1 → escalation (request-review: needs-discussion)
 * - critical|high ≥ 1 → needs-fix
 *
 * Matches the implementation in `deriveJudgeVerdict` and `deriveRequestReviewVerdict`
 * in `src/core/step/judge-verdict.ts`.
 *
 * Note: result md files are evidence reports — agents do NOT write verdict lines.
 * Verdict is derived by CLI from typed findings (report_result tool) only.
 */
export const VERDICT_BLOCKING_RULES =
`**Verdict blocking rules (derived by CLI from the reported findings)**:
- \`decision-needed\` ≥ 1 → \`escalation\`（request-review では \`needs-discussion\`）
- \`critical\` または \`high\` ≥ 1 → \`needs-fix\`
- それ以外 → \`approved\``;
