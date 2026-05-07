## Why

spec-runner の ALLOWED_TYPES（6 type）と openspec-workflow の type-config.md（5 type）が乖離している。branch prefix は `feat/` にハードコードされ、type に基づくフロー分岐が存在しない。request type を single source of truth（TYPE_CONFIG）に集約し、branch prefix と spec-review mode を type から導出する。

## What Changes

- `src/config/type-config.ts` を新設し、5 type（`new-feature`, `bug-fix`, `spec-change`, `refactoring`, `chore`）の定義を `Record<string, TypeConfigEntry>` で集約
- `ALLOWED_TYPES` を `Object.keys(TYPE_CONFIG)` で導出（`documentation`, `improvement` 削除、`refactor` → `refactoring` リネーム、`spec-change` 追加）
- `propose.ts:61` と `executor.ts:218` のハードコード `feat/` を `TYPE_CONFIG[type].branchPrefix` に置き換え
- `job-slug.ts:17` の `BRANCH_PREFIXES` を TYPE_CONFIG から導出
- `SpecReviewPromptInput` に `specReviewMode` field を追加し、spec-review の prompt に注入

## Capabilities

### New Capabilities

- `type-config`: request type ごとの branch prefix、spec-review mode、specImpact を定義する config module

### Modified Capabilities

- `request-md-parser`: ALLOWED_TYPES を TYPE_CONFIG から導出。`refactoring` と `spec-change` を認識
- `propose-session`: branch prefix を type から解決
- `step-execution-architecture`: executor の branch 生成を type から解決
- `spec-review-session`: specReviewMode を prompt に注入

## Impact

- `src/config/type-config.ts`: 新規ファイル（TypeConfigEntry 型 + TYPE_CONFIG 定数）
- `src/parser/request-md.ts`: ALLOWED_TYPES を TYPE_CONFIG から導出
- `src/core/step/propose.ts:61`: branch prefix の動的解決
- `src/core/step/executor.ts:218`: branch prefix の動的解決
- `src/state/job-slug.ts:17`: BRANCH_PREFIXES を TYPE_CONFIG から導出
- `src/prompts/spec-review-system.ts`: SpecReviewPromptInput に specReviewMode 追加
- `src/core/step/spec-review.ts:78`: specReviewMode の注入
- `tests/parser.test.ts`: type 名更新
- `tests/state/job-slug.test.ts`: BRANCH_PREFIXES テスト更新
