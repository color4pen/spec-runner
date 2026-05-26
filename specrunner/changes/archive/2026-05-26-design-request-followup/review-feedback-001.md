# Code Review — design-request-followup — Iteration 1

- **verdict**: approved

---

## Summary

request.md の補助 section（スコープ外 / 受け入れ基準 / architect 評価済みの設計判断）を CLI 側から design / code-review の initial message に注入する変更。設計方針（D1〜D5）に沿った実装であり、受け入れ基準を全て充足している。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | completeness | src/prompts/fragments.ts:80 | `7` → `7.0` への変更が本 request のスコープ外（タスク定義に記載なし） | 独立 commit として分離するか、次回 PR に持ち越す | no |
| 2 | LOW | completeness | tests/pipeline-integration.test.ts:2119 | `&& !t.when` によるテスト修正が本 request のスコープ外 | 独立 commit として分離するか、次回 PR に持ち越す | no |

---

## Detailed Notes

### 機能実装（問題なし）

**`src/parser/extract-section.ts`**
- `extractMarkdownSections`: `##` 境界の検出に `/^##\s+/` を使用。`### ` は `#` が3文字目に来るため正しく除外される。TC-05 相当の境界が正確に実装されている。
- `headingPattern.test(line.trimEnd())` の `.trimEnd()` は末尾空白を持つ行への追加防御で実害なし（regex 側の `\\s*$` でも対応済）。
- `buildRequestConstraintsBlock`: `REQUEST_CONSTRAINT_HEADINGS` の順序でイテレートし、存在する section のみを出力。`undefined` 返却パスも正確。

**`src/prompts/design-system.ts`**
- 注入順序: `</user-request>` → `\n\n${constraintsBlock}` → `\n\n## Repository Context`。TC-16 の配置順が確実に保たれている。
- `dynamicContext` が absent の場合も注入が動作する（Repository Context なし構成で `base` に constraints が末尾追加）。

**`src/core/step/code-review.ts`**
- `constraintsSection` を `contextSection` の前に置く文字列結合順序が正確（TC-21）。
- `constraintsBlock` が `undefined` の場合は空文字列にフォールバックし、Branch Context が直後に続く既存挙動を維持。

### テスト品質

- TC-01〜TC-13（Unit-Parser/Builder）, TC-14〜TC-18（design step）, TC-20〜TC-23（code-review step）: must シナリオ全 25 件カバー済み（verification-result の test-coverage: 25/25）。
- TC-04 テストは「エントリなし or 空文字列」の両方に対応する assertionを備えており、実装の意図（空 body は Map に含めない）と整合している。
- `bun run typecheck && bun run test` は clean pass（267 file / 2991 tests）。

### スコープ外変更について（Finding #1, #2）

どちらも net-positive な変更だが、本 request の変更目的と関係がないため audit trail が不明確になる。次回 PR への分離を推奨するが、blocking ではない（verdict に影響しない）。
