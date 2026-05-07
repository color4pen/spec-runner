# Spec Review Result — add-spec-change-to-allowed-types

- **change**: add-spec-change-to-allowed-types
- **type**: spec-change
- **iteration**: 1
- **verdict**: approved

## Summary

仕様は request.md の全要件を網羅し、design.md の判断（D1–D5）が既存の config 層パターン（schema.ts / step-config.ts）に整合している。コードベース検証で全 claim が正確と確認。CRITICAL/HIGH の findings なし。MEDIUM 2 件、LOW 1 件を記録する。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | tasks.md (Task 3.3) | `BRANCH_PREFIXES` を `Object.values(TYPE_CONFIG).map(c => c.branchPrefix)` で導出するが、既存の `job-slug.ts:17` は既に `["feat/", "fix/", "change/", "refactor/", "chore/"]` を持っており、導出後の値は同一。しかし design.md D4 が「重複排除は不要（各 type の prefix はユニーク）」と明言する一方、将来 type 追加で prefix が重複した場合（例: 2 type が同じ prefix を使う）に `stripBranchPrefix` が二重マッチする。現時点では問題にならないが、`[...new Set(...)]` で防御するか、uniqueness assertion を type-config.ts のテスト（Task 5.1）に含めるべき | Task 5.1 の TYPE_CONFIG テストに「全 branchPrefix がユニーク」のアサーションを追加する |
| 2 | MEDIUM | completeness | tasks.md (Task 4.2) | `buildSpecReviewInitialMessage()` に `specReviewMode` を注入する際の具体的な template 文が定義されているが、mode が `undefined`（optional field）の場合のフォールバック挙動が tasks.md に明記されていない。design.md D5 は `?? "full"` fallback を `spec-review.ts:buildMessage()` 側で規定しているが、prompt template 側で `specReviewMode` が未指定のまま渡された場合のハンドリングが不明 | Task 4.2 に「`specReviewMode` が undefined の場合は full 相当の指示文を出力する」旨を明記する。または Task 4.1 の field を optional ではなく required にし、呼び出し側（Task 4.4）で必ず解決済みの値を渡す設計に統一する |
| 3 | LOW | consistency | proposal.md / request.md | proposal.md の Impact に `src/core/step/spec-review.ts:78` とあるが、実際の `buildMessage()` は line 75 から開始。微小な乖離だが、implementer が該当箇所を探す際に混乱しうる | proposal.md の行番号を `:75` に修正するか、行番号を削除して関数名のみで参照する |

## Detailed Assessment

### Completeness (request ↔ spec)

request.md の全 13 要件が proposal.md / design.md / tasks.md でカバーされている。

- 要件 1（TYPE_CONFIG module）: design D1 + tasks 1.1–1.4
- 要件 2（TypeConfigEntry プロパティ）: design D1 の interface 定義
- 要件 3（ALLOWED_TYPES 導出）: design D2 + tasks 2.1–2.3
- 要件 4–8（ALLOWED_TYPES 整理）: tasks 2.1–2.5
- 要件 9（branch prefix 動的解決）: design D3 + tasks 3.1–3.2
- 要件 10（BRANCH_PREFIXES 導出）: design D4 + tasks 3.3
- 要件 11–13（spec-review mode 注入）: design D5 + tasks 4.1–4.4

### Consistency (spec ↔ existing codebase)

- `ALLOWED_TYPES` の現状 6 type と、目標 5 type の差分が正確に記述されている（`documentation`, `improvement` 削除、`refactor` → `refactoring` リネーム、`spec-change` 追加）
- `propose.ts:61` と `executor.ts:218` のハードコード `feat/` が実コードと一致
- `job-slug.ts:17` の `BRANCH_PREFIXES` が実コードと一致
- `SpecReviewPromptInput` の現在のフィールド構成が正確に把握されている
- `buildMessage()` の行番号が 75 であり、spec の 78 と微小な乖離あり（Finding #3）

### Feasibility

- Phase 1（config module）→ Phase 2（ALLOWED_TYPES）→ Phase 3（branch prefix）→ Phase 4（spec-review mode）→ Phase 5（tests）の順序は依存グラフに沿っており実行可能
- `getBranchPrefix` / `getSpecReviewMode` ヘルパーの導入は、各 step が TYPE_CONFIG を直接参照するよりテスタビリティが高い
- `deps.request.type` 経由のアクセスは既存パターンに沿っており、PipelineDeps / StepContext の型変更不要の判断は妥当
- unknown type の `feat/` / `"full"` fallback は後方互換性を確保する妥当な設計

### Scenarios Coverage

delta spec は存在しない（`specs/` ディレクトリなし）。request.md の背景セクションで「delta spec の生成有無は type では決まらない。CLI の artifact 判定に委ねる」と明示されており、本 change が spec artifact を変更しない設計は意図的。tasks.md のテスト（Task 5.1–5.3）が TYPE_CONFIG の正しさ・parser の後方互換・BRANCH_PREFIXES の導出をカバーしている。
