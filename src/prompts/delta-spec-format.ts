/**
 * Shared delta spec format constants.
 *
 * Single source of truth for path conventions and format rules used by
 * both design-system.ts and spec-fixer-system.ts.
 *
 * Eliminates duplicate management: edit here to propagate to all agent prompts.
 */

/** The only canonical path pattern for delta spec files. */
export const CANONICAL_DELTA_SPEC_PATH_PATTERN = "specs/<capability-name>/spec.md";

/**
 * Explicitly banned path patterns for delta spec files.
 * Matched in design-system.ts and spec-fixer-system.ts prompts.
 */
export const BANNED_DELTA_SPEC_PATHS: string[] = [
  "`<change>/delta-spec.md`（単一フラット形式）",
  "`<change>/delta-spec/<capability>.md`（ディレクトリ形式だが非正規）",
  "`<change>/specs/<name>.delta.md`（拡張子付きフラット形式）",
];

/**
 * Valid section header strings for delta spec files.
 * Used by both agent prompts and the delta-spec-validator.
 */
export const VALID_SECTION_HEADERS: string[] = [
  "## ADDED Requirements",
  "## MODIFIED Requirements",
  "## REMOVED Requirements",
  "## RENAMED Requirements",
];

/**
 * Shared delta spec format rules content block.
 *
 * Covers:
 *   - Section headers (ADDED / MODIFIED / REMOVED / RENAMED)
 *   - Rules 1-6 (Requirement structure, Scenario requirement, normative keywords, etc.)
 *   - ファイル配置 with explicit banned path list
 *
 * Both design-system.ts and spec-fixer-system.ts embed this block after their own
 * section header and intro sentence.
 */
export const DELTA_SPEC_FORMAT_RULES = `### 使用するセクションヘッダー

- \`## ADDED Requirements\` — 新規 Requirement を追加する場合
- \`## MODIFIED Requirements\` — 既存 Requirement を変更する場合
- \`## REMOVED Requirements\` — 既存 Requirement を削除する場合
- \`## RENAMED Requirements\` — Requirement header を変更する場合（MODIFIED と併記必須）

### ルール

1. **各 Requirement は \`### Requirement:\` で始まる header を持つこと**
2. **各 Requirement は少なくとも 1 つの \`#### Scenario:\` を含むこと**（scenario なしは validation error）
   - **MODIFIED Requirements にも最低 1 つの Scenario が必須である。** Scenario は「差分の説明文」や「変更概要」ではなく、変更後のシステムの振る舞いを Given/When/Then 形式で具体的に記述すること。
3. **\`## MODIFIED Requirements\` 配下の \`### Requirement:\` header は、変更前の元の header と完全一致すること**。header を変えたい場合は \`## RENAMED Requirements\` を併記し FROM / TO を明示する。
4. **\`## Changed Requirement:\` や \`## Updated:\` などの独自フォーマットは禁止**。認識されるのは \`## ADDED/MODIFIED/REMOVED/RENAMED Requirements\` のみ。
5. **Requirement 本文（header 直後〜最初の Scenario の間）に英語の \`SHALL\` または \`MUST\` を少なくとも 1 つ含めること**（normative keyword なしは validation error）
6. **\`### Requirement:\` header と最初の \`#### Scenario:\` の間にコードブロック（\`\`\` ）を挟まないこと**（コードブロックが入るとシナリオ紐付けが失敗する）

### ファイル配置

- delta spec は \`specs/<capability-name>/spec.md\` に配置すること（唯一の正規 path）
- \`<capability-name>\` は design.md で宣言した名前を使用すること
- 以下の正規外 path への出力は禁止:
  - \`<change>/delta-spec.md\`（単一フラット形式）
  - \`<change>/delta-spec/<capability>.md\`（ディレクトリ形式だが非正規）
  - \`<change>/specs/<name>.delta.md\`（拡張子付きフラット形式）`;
