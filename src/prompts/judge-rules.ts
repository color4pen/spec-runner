/**
 * Shared judge rule constants.
 *
 * Single source of truth for:
 * - DECISION_NEEDED_DEFINITION: when to assign the `decision-needed` resolution
 * - VERDICT_BLOCKING_RULES: blocking conditions and findings-priority semantics
 *
 * All judge-step prompts and result templates import from this module.
 * This module has no project-internal imports (leaf — no circular dependencies).
 */

/**
 * Resolution `decision-needed` bullet point for judge prompt "Resolution 定義" sections.
 *
 * Limited to items only the request author can decide.
 * Designed to replace the `- \`decision-needed\`: ...` line in each prompt's Resolution block.
 */
export const DECISION_NEEDED_DEFINITION =
`- \`decision-needed\`: **request 作成者でなければ決められない事項に限る**。
  - 該当例: 要件同士の矛盾 / 複数の妥当な選択肢があり作成者の意図が必要 / 前提となる文脈の不足
  - 非該当例: 実装者が選べる技術判断 / 推奨改善 / ドキュメント追記の提案 → これらは \`fixable\` と適切な severity で表現する
  - 迷った場合は \`fixable\` に倒す`;

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
 * Verdict blocking rules for use in prompts, pipeline rules, and result templates.
 *
 * Describes:
 * - decision-needed ≥ 1 → escalation (request-review: needs-discussion)
 * - critical|high ≥ 1 → needs-fix
 * - findings-derived verdict takes priority over markdown verdict line
 *
 * Matches the implementation in `deriveJudgeVerdict` and `deriveRequestReviewVerdict`
 * in `src/core/step/judge-verdict.ts`.
 */
export const VERDICT_BLOCKING_RULES =
`**Verdict blocking rules (derived by CLI from report_result findings)**:
- \`decision-needed\` ≥ 1 → \`escalation\`（request-review では \`needs-discussion\`）
- \`critical\` または \`high\` ≥ 1 → \`needs-fix\`
- それ以外 → \`approved\`

markdown の verdict 行と \`report_result\` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。`;
