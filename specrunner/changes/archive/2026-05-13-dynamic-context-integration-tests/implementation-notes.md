# Implementation Notes: DynamicContext 注入の統合テスト

## Summary

- **result**: completed
- **tasks_completed**: 5/5

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `tests/pipeline-integration.test.ts` | Modified | TC-DC-101〜TC-DC-108 の統合テスト 8 ケースを追加 |
| `specrunner/changes/dynamic-context-integration-tests/tasks.md` | Modified | 全タスクを [x] に更新 |

## What Was Implemented

`tests/pipeline-integration.test.ts` に以下のテストを追加:

- **TC-DC-101**: `runner.run()` spy を使い、全 agent ステップで `ctx.dynamicContext` が `testDynamicContext` の各フィールド（gitLog, diffStat, changesList）と一致することを検証
- **TC-DC-102**: `ctx.dynamicContext.specIndex` が全 agent ステップに 2 エントリで伝搬されることを検証
- **TC-DC-103**: allowlist ステップ（propose / spec-review / implementer / code-review）で `ctx.projectContext` が `"# Test Project Context"` と一致することを検証
- **TC-DC-104**: 非 allowlist ステップ（test-case-gen）で `ctx.projectContext` が `undefined` であることを検証
- **TC-DC-105**: `SpecReviewStep.enrichContext` spy を使い、delta spec ディレクトリが存在する場合に `baselineSpecs["my-cap"]` が返却値に含まれることを検証
- **TC-DC-106**: delta spec ディレクトリが存在しない場合に `baselineSpecs` が undefined のまま pipeline が正常完了することを検証
- **TC-DC-107**: `project.md` が存在しない場合に allowlist ステップでも `projectContext` が `undefined` となり、pipeline がエラーなく完了することを検証
- **TC-DC-108**: `dynamicContext` を deps に渡さない場合に全ステップで `ctx.dynamicContext` が `undefined` となり後方互換性が保たれることを検証

## Test Infrastructure

- `buildRunnerWithSpy()` ヘルパー関数を追加: `buildRunner()` が返す runner の `run` メソッドを spy through でラップし、全 `AgentRunContext` をキャプチャする。
- `testDynamicContext` 定数（モジュールスコープ）を定義してテスト間で共有。
- 既存の `buildPipelineMockClient` / `buildMockGithubClient` / `buildConfig` / `buildRunner` / `makeJobState` をそのまま活用。

## Blocked Tasks

なし

## Test Results

- 新規テスト: 8 ケース全 pass
- 既存テスト: TC-010〜TC-061 を含む 1715 ケース全 pass
- 合計: 1723 tests passed
- typecheck: エラーなし
