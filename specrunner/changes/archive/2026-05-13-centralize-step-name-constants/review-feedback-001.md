# Review Feedback 001 — centralize-step-name-constants

- **date**: 2026-05-13
- **iteration**: 1
- **verdict**: approved

## Summary

リファクタリング全体が design/tasks 通りに正しく実装されている。grep 検証コマンドの残余ヒットはすべて

1. JSDoc / インラインコメント内の文字列（`@example "design"` 系）
2. `validateJobState` の後方互換リマップ（request.md で明示的にスコープ外）
3. `migrate.ts` の `propose` キー → `STEP_NAMES.DESIGN` 値の行（キーは後方互換、値は定数化済み）

— の3カテゴリで、すべて design.md / request.md でスコープ外と定義された範囲内。

`STEP_NAMES` 定数は `as const` で正しく定義され、`StepName` は `typeof STEP_NAMES[keyof typeof STEP_NAMES]` で導出、`AgentStepName` も定数からの `Exclude` に更新。10 個の step 定義ファイルで `name:` / `role:` / `state.steps[]` / `getLatestStepResult` / `branchNotSetError` のすべてが定数参照に置換されている。`STANDARD_TRANSITIONS` / `LOOP_ERROR_CODES` / `STANDARD_TRANSITIONS` / `PROJECT_CONTEXT_STEPS` / `SPEC_PHASE_STEPS` / `CODE_PHASE_STEPS` / `REVIEWER_STEPS` / `STEP_MAPPING` / `REQUIRED_AGENTS` / `AGENT_ROLES` / `CAMEL_TO_KEBAB` の値もすべて変換済み。

verification-result.md で typecheck/test とも passed、テスト 1726 件全 pass。振る舞いの変更なし。

TC-01〜TC-22 の must 項目はすべて満たしている。

## Findings

### [NIT] JSDoc コメント内のステップ名文字列リテラルが残存
- **file**: src/core/step/types.ts, src/config/schema.ts, src/config/step-config.ts, src/core/pipeline/pipeline.ts (line 329), src/core/step/{spec-review,spec-fixer,test-case-gen,implementer,build-fixer,code-review,code-fixer}.ts
- **line**: 各種
- **issue**: JSDoc / インラインコメント内に `"design"`, `"spec-review"`, etc. の文字列リテラルが残っている（例: `* Has its own dedicated AgentDefinition (role: "spec-review").` や `e.g. "design", "spec-review"`）。spec-review-result-002 でも「false positive、コメント行として識別して除外できる」と判断済み。プログラム的な動作には影響しない。
- **suggestion**: 任意。気になる場合はコメント内も `STEP_NAMES.*` を参照する形（"… (role matches STEP_NAMES.SPEC_REVIEW)"）に書き換えられるが、可読性が落ちるので現状維持が妥当。

### [NIT] schema.ts の import 位置が type alias の後ろ
- **file**: src/state/schema.ts
- **line**: 7-14
- **issue**: `JobStatus` の type alias がファイル冒頭にあり、その後で `import type { ModelUsage }`、`export type { ModelUsage }`、さらに `import { STEP_NAMES }` が混在している。既存コードのスタイルを踏襲しているため変更ではないが、import block と type alias が交互に出現していて読みにくい。
- **suggestion**: 既存スタイルの踏襲なのでこのリファクタの責務外。別途整理する余地あり。

