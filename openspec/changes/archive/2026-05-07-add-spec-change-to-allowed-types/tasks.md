## 1. TYPE_CONFIG module の作成

- [x] 1.1 `src/config/type-config.ts` を新設し、`TypeConfigEntry` interface と `TYPE_CONFIG` 定数を定義する
  - `branchPrefix: string`
  - `specReviewMode: "full" | "lightweight"`
  - `specImpact: string`（spec-review prompt 注入用）
  - `description: string`（人間向け説明）
- [x] 1.2 5 type を定義: `new-feature`（feat/, full）, `spec-change`（change/, full）, `refactoring`（refactor/, lightweight）, `bug-fix`（fix/, full）, `chore`（chore/, lightweight）
- [x] 1.3 `getBranchPrefix(type: string): string` ヘルパーを export する。unknown type は `"feat/"` fallback（後方互換）
- [x] 1.4 `getSpecReviewMode(type: string): "full" | "lightweight"` ヘルパーを export する。unknown type は `"full"` fallback

## 2. ALLOWED_TYPES の整理

- [x] 2.1 `src/parser/request-md.ts` の `ALLOWED_TYPES` 定数を削除し、`TYPE_CONFIG` から `Object.keys()` で導出する
- [x] 2.2 `isAllowedType()` を `(t: string): t is keyof typeof TYPE_CONFIG` に変更（`key in TYPE_CONFIG` で判定）
- [x] 2.3 unknown type の warning 続行ロジックを維持する（エラーにしない）
- [x] 2.4 `tests/parser.test.ts` を更新: テスト内の `refactor` → `refactoring` に変更（テストで使われている type 名があれば）
- [x] 2.5 `type: spec-change` と `type: refactoring` をパースして warning が出ないことを検証するテストを追加

## 3. branch prefix の type 連動

- [x] 3.1 `src/core/step/propose.ts:61` のハードコード `feat/` を `getBranchPrefix(deps.request.type)` に置き換え（`type-config.ts` から import）
- [x] 3.2 `src/core/step/executor.ts:218` のハードコード `feat/` を `getBranchPrefix(state.request.type)` に置き換え
- [x] 3.3 `src/state/job-slug.ts:17` の `BRANCH_PREFIXES` 定数を `Object.values(TYPE_CONFIG).map(c => c.branchPrefix)` で導出するように変更

## 4. spec-review mode の注入

- [x] 4.1 `src/prompts/spec-review-system.ts` の `SpecReviewPromptInput` に `specReviewMode?: "full" | "lightweight"` field を追加
- [x] 4.2 `buildSpecReviewInitialMessage()` で `specReviewMode` に応じた review 強度の指示文をテンプレートに追加する
  - `"full"`: `Review scope: Full review including security considerations (authentication, input validation, OWASP Top 10 where applicable).`
  - `"lightweight"`: `Review scope: Architecture and specification review only. Security review is not required for this request type.`
- [x] 4.3 `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` に `{{SPEC_REVIEW_MODE}}` placeholder を追加
- [x] 4.4 `src/core/step/spec-review.ts:buildMessage()` で `getSpecReviewMode(state.request.type)` を解決し、`SpecReviewPromptInput.specReviewMode` に渡す

## 5. テスト

- [x] 5.1 `tests/config/type-config.test.ts` を新設: TYPE_CONFIG の 5 type 存在確認、`getBranchPrefix` の各 type + unknown fallback、`getSpecReviewMode` の各 type + unknown fallback
- [x] 5.2 `tests/parser.test.ts` に `spec-change` / `refactoring` が warning なしでパースされるテストを追加
- [x] 5.3 `tests/state/job-slug.test.ts` の `stripBranchPrefix` テストが引き続き 5 prefix 全てで pass することを確認（BRANCH_PREFIXES が TYPE_CONFIG 導出に変わっても prefix 値は同一なので既存テストは変更不要のはず）

## 6. 検証

- [x] 6.1 `bun run typecheck` が green
- [x] 6.2 `bun run test` が green
