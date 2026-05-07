# Implementation Notes: step-config-externalization

## Status

- **result**: completed
- **tasks_completed**: 15/15

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/config/schema.ts` | modified | `StepExecutionConfig`、`StepConfigMap` 型を追加。`SpecRunnerConfig` に `steps?` フィールド追加。`RawConfig` に `steps?` フィールド追加。`validateConfig()` に steps バリデーション追加（maxTurns/model/timeoutMs の型・範囲検証） |
| `src/config/step-config.ts` | created | `ResolvedStepConfig`、`StepDefaults` 型と `getStepExecutionConfig()` 純粋関数を実装。4 段階解決チェーン（step-level > defaults > stepDefaults > null）|
| `src/adapter/claude-code/agent-runner.ts` | modified | `getStepExecutionConfig()` を呼び出し config 経由の model/maxTurns を SDK に渡す。`step.maxTurns ?? 30` フォールバックを削除。`maxTurns: null` 時に SDK options から maxTurns を省略 |
| `src/cli/init.ts` | modified | `runInitLocal()` で `steps` 未設定時に `steps.defaults` を追加（model/maxTurns/timeoutMs）。既存 `steps` がある場合は上書きしない |
| `tests/config/step-config.test.ts` | created | `getStepExecutionConfig()` の解決順序テスト（TC-001〜005, 009, 017〜019）と `validateConfig()` steps バリデーションテスト（TC-013〜016, 023）|
| `tests/unit/adapter/claude-code/agent-runner.test.ts` | modified | TC-002/TC-003 を config 経由解決に更新。TC-006, TC-007, TC-008, TC-012, TC-020 を追加 |
| `tests/init.test.ts` | modified | TC-010（steps.defaults 生成）、TC-011（上書き防止）を追加 |
| `openspec/changes/step-config-externalization/tasks.md` | modified | 全タスクを完了マーク（`- [x]`）に更新 |
| `openspec-workflow/requests/active/step-config-externalization/decisions/implementer.md` | created | 実装判断を記録 |

## Blocked Tasks

なし

## Test Cases Coverage

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-001 | must | implemented | step-config.test.ts |
| TC-002 | must | implemented | step-config.test.ts |
| TC-003 | must | implemented | step-config.test.ts |
| TC-004 | must | implemented | step-config.test.ts |
| TC-005 | must | implemented | step-config.test.ts |
| TC-006 | must | implemented | agent-runner.test.ts |
| TC-007 | must | implemented | agent-runner.test.ts |
| TC-008 | must | implemented | agent-runner.test.ts |
| TC-009 | must | implemented | step-config.test.ts |
| TC-010 | must | implemented | init.test.ts |
| TC-011 | must | implemented | init.test.ts |
| TC-012 | must | implemented | agent-runner.test.ts |

## Implementation Decisions

- `null` と `undefined` の区別を解決チェーンで維持。`null` = unlimited（フォールバックしない）、`undefined` = 次の優先度へフォールバック
- `step.maxTurns ?? 30` フォールバックを完全削除。step.maxTurns が undefined の場合、stepDefaults.maxTurns も undefined → resolves to null → SDK には maxTurns を渡さない（unlimited）
- 既存テスト TC-002（step.maxTurns=undefined → 30）は仕様変更に合わせ更新: 旧フォールバックが `??30` から config 解決チェーンに変わったため、期待値は `maxTurns=undefined`（省略）に変更
- `timeoutMs` は `ResolvedStepConfig` で解決するが SDK options には渡さない（SDK 未対応）

## Verification Results

- `bun run typecheck`: exit 0（型エラーなし）
- `bun run test`: 103 test files passed, 879 tests passed
- `openspec validate step-config-externalization --type change --strict`: Change is valid
