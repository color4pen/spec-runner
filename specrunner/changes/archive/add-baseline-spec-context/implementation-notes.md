# Implementation Notes: add-baseline-spec-context

## Status

- **result**: completed
- **tasks_completed**: 8/8

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/git/dynamic-context.ts` | modified | `SpecIndexEntry` interface を export 追加。`DynamicContext` に `specIndex: SpecIndexEntry[]` フィールド追加。`collectSpecIndex()` private 関数を実装（specsDirRel() 使用、fallback 付き）。`extractPurpose()` / `countRequirements()` ヘルパー追加。`collectDynamicContext` の `Promise.all` に `collectSpecIndex` を追加 |
| `src/prompts/propose-system.ts` | modified | `import type { DynamicContext }` 追加。`buildInitialMessage` 第4引数の型を `DynamicContext` に変更。specIndex テーブル（Baseline Specs）を Repository Context セクションに注入するロジックを追加。`PROPOSE_SYSTEM_PROMPT` に「Baseline Spec 参照」セクションを path-fence 直後・禁止事項直前に追加 |
| `tests/git/dynamic-context.test.ts` | modified | TC-DC-015〜018 を追加（specIndex の空配列フォールバック、SpecIndexEntry 生成、スキップ動作、昇順ソート）。`specsDirRel` import 追加 |
| `tests/prompts/dynamic-context-prompts.test.ts` | modified | TC-DC-011〜014 を追加（Baseline Specs テーブル注入、空時の省略、changesList+specIndex 同時処理、独立条件分岐）。`FULL_CONTEXT` に `specIndex: []` 追加。既存テストの partial object を完全な `DynamicContext` に更新 |
| `tests/prompts/propose-system.test.ts` | modified | TC-SP-001、TC-SP-002 を追加（Baseline Spec 参照セクション存在確認、配置順序確認） |
| `specrunner/changes/add-baseline-spec-context/tasks.md` | modified | 全タスクを完了マーク（`- [x]`）に更新 |

## Blocked Tasks

なし

## Test Cases Coverage

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-DC-015 | must | implemented | tests/git/dynamic-context.test.ts |
| TC-DC-016 | must | implemented | tests/git/dynamic-context.test.ts |
| TC-DC-017 | must | implemented | tests/git/dynamic-context.test.ts |
| TC-DC-018 | must | implemented | tests/git/dynamic-context.test.ts |
| TC-DC-011 | must | implemented | tests/prompts/dynamic-context-prompts.test.ts |
| TC-DC-012 | must | implemented | tests/prompts/dynamic-context-prompts.test.ts |
| TC-DC-013 | must | implemented | tests/prompts/dynamic-context-prompts.test.ts |
| TC-DC-014 | must | implemented | tests/prompts/dynamic-context-prompts.test.ts |
| TC-SP-001 | must | implemented | tests/prompts/propose-system.test.ts |
| TC-TYPE-001 | must | verified by typecheck | bun run typecheck pass |
| TC-REG-001 | must | verified | TC-DC-001〜010 全 pass |
| TC-REG-002 | must | verified | bun run typecheck exit 0 |
| TC-REG-003 | must | verified | bun run test 1610 tests pass |

## Verification Results

- `bun run typecheck`: exit 0（型エラーなし）
- `bun run test`: 142 test files, 1610 tests passed
