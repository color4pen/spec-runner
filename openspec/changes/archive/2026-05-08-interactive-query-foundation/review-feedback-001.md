# Code Review — interactive-query-foundation — Iteration 1

- **verdict**: approved
- **iteration**: 1
- **total-score**: 8.45

## Scores

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| correctness | 0.30 | 9 | 2.70 |
| security | 0.25 | 8 | 2.00 |
| architecture | 0.15 | 9 | 1.35 |
| performance | 0.10 | 8 | 0.80 |
| maintainability | 0.10 | 8 | 0.80 |
| testing | 0.10 | 8 | 0.80 |

## Summary

全要件を正確に実装。Hexagonal Architecture の依存方向を維持しつつ `queryInteractive()` を interface 外メソッドとして追加した設計判断は LSP 準拠で正しい。`buildSdkOptions()` による共通化、session fields の条件付き追加（undefined 時は省略）、`bootstrap.ts` のスコーピング（create/resume 専用、run.ts は preflight 経由で除外）いずれも的確。テストは spec 要件の全項目をカバーしている。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | maintainability | src/core/runtime/local.ts:62-76 | Legacy positional constructor は `sdkQueryFn` を受け付けない。Named options constructor との非対称性がある。テストで legacy constructor 経由では `queryInteractive()` の mock 注入ができない | Legacy constructor に `sdkQueryFn` パラメータを追加するか、deprecation comment を付与して named options への移行を促す |
| 2 | LOW | correctness | src/core/runtime/local.ts:98-99 | `buildSdkOptions()` で `model` と `systemPrompt` は undefined 時もキーとして含まれる（`model: undefined`）。session fields は条件付き追加で undefined キーを排除している。挙動差がある | 統一するなら `model`/`systemPrompt` も条件付き追加にする。ただし既存動作の変更なので regression risk あり。現状維持でも実害なし |
| 3 | LOW | maintainability | src/core/command/create.ts:18 | `export { isResultMessage }` の re-export は後方互換のために必要だが、将来的に import 元が 2 箇所存在する状態を維持し続けると混乱の種になる | 次の breaking change タイミングで re-export を削除し、全 consumer を `message-types.ts` からの直接 import に統一する |

## Acceptance Criteria Verification

- [x] `QueryOptions` に `sessionId` / `continue` / `resume` / `includePartialMessages` が追加されている — strategy.ts:29-33
- [x] `LocalRuntime.query()` が新フィールドを SDK にパススルーする — local.ts:93-107 buildSdkOptions()
- [x] `RuntimeStrategy` interface の `query()` signature は `prompt: string` のまま — strategy.ts:89
- [x] `LocalRuntime.queryInteractive()` が generator prompt を受け取り SDK の `Query` オブジェクトを返す — local.ts:129-134
- [x] CLI bootstrap が `src/cli/bootstrap.ts` に共通化され、create/resume が利用している — bootstrap.ts, create.ts:49, resume.ts:24
- [x] `run.ts` は bootstrap() を使わず preflight 経由（D4 設計判断通り） — run.ts 変更なし
- [x] `isResultMessage()` が `src/adapter/claude-code/message-types.ts` に移動している — message-types.ts:12-22
- [x] 既存の 1-shot create が壊れていない — create.ts は runtime.query() を引き続き使用
- [x] `bun run typecheck && bun run test` が green — verification-result.md: 125 files, 1190 tests passed

## Test Coverage

| Spec Requirement | Test Case | Status |
|-----------------|-----------|--------|
| #11 QueryOptions 新フィールドの SDK パススルー | TC-LR-013 (2 tests) | covered |
| #12 queryInteractive() が Query を返す | TC-LR-014 (2 tests) | covered |
| #13 bootstrap() エラーハンドリング | TC-BS-001, TC-BS-002 (3 tests) | covered |
| #14 isResultMessage() 移動後の既存テスト | create.test.ts + message-types.test.ts | covered |

test-cases.md は本 change に存在しないため Scenario Coverage の評価は N/A。
