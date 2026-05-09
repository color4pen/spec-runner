# Code Review — move-sdk-to-adapter — iteration 1

- **reviewer**: code-reviewer (manual)
- **iteration**: 1
- **verdict**: approved

## Summary

設計通りの clean な refactoring。`src/sdk/` の廃止、`factory.ts` の DI 化、デッドコード削除がすべて正しく実施されている。`src/core/` から `@anthropic-ai/sdk` の直接 import はゼロ。typecheck・全 1294 テスト green。

TC-09（must: sessionClient 未指定時の throw）のテストが未実装だが、実装自体は正しく、既存テストにリグレッションなし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/core/runtime/factory.test.ts | TC-09（must）sessionClient 未指定で managed runtime を要求した場合の `throw Error("sessionClient is required for managed runtime")` パスのテストが未実装 | `describe("TC-09")` を追加し、`expect(() => createRuntime(managedConfig, cwd, gh, repo)).toThrow("sessionClient is required")` をアサート |
| 2 | LOW | correctness | src/cli/run.ts:35, src/cli/bootstrap.ts:34 | design.md では条件が `config.runtime !== "local"` だが、実装は `config.runtime !== "local" && config.anthropic?.apiKey` に拡張されている。apiKey 欠落時に `createAnthropicClient` のクラッシュを防ぐ防御的改善であり実害なし | 情報提供のみ。現行のままで問題なし |

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 6 | 0.10 | 0.60 |
| **Total** | | | **8.60** |

## Acceptance Criteria

| Criterion | Status |
|-----------|--------|
| `src/sdk/` ディレクトリが存在しない | ✅ |
| `src/core/` 配下から `@anthropic-ai/sdk` の直接 import がない | ✅ |
| `factory.ts` が DI 経由でクライアントを受け取っている | ✅ |
| 全既存テストが pass する | ✅ (1294 passed) |
| `bun run typecheck && bun run test` が green | ✅ |

## Test Coverage (must scenarios)

| TC | Description | Covered |
|----|-------------|---------|
| TC-01 | src/sdk/ 不在 | ✅ filesystem 検証 |
| TC-02 | client.ts が adapter 層に存在 | ✅ git mv |
| TC-03 | environments.ts が adapter 層に存在 | ✅ git mv |
| TC-04 | agents.ts 削除 | ✅ |
| TC-05 | sessions.ts 削除 | ✅ |
| TC-06 | core/ に @anthropic-ai/sdk import なし | ✅ grep 検証 |
| TC-07 | src/ に sdk/ 残留 import なし | ✅ grep 検証 |
| TC-08 | factory: sessionClient 注入 → ManagedRuntime | ✅ TC-RT-002, TC-RT-003 |
| TC-09 | factory: sessionClient なし → throw | ❌ テスト未実装 |
| TC-10 | factory: local → LocalRuntime | ✅ TC-RT-001 |
| TC-11 | factory.ts の import 構成 | ✅ ソース検証 |
| TC-12 | run.ts が sessionClient を構築 | ✅ ソース検証 |
| TC-14 | bootstrap.ts が sessionClient を構築 | ✅ ソース検証 |
| TC-16 | init.ts import パス | ✅ diff 検証 |
| TC-17 | rm.ts import パス | ✅ diff 検証 |
| TC-18 | completion.test.ts import パス | ✅ diff 検証 |
| TC-19 | typecheck green | ✅ |
| TC-20 | test green | ✅ |
