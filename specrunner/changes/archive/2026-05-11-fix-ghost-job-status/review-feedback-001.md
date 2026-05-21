# Code Review — fix-ghost-job-status — Iteration 1

## Summary

実装は design.md に忠実で、3 つのエラーパス（setupWorkspace / buildDeps+registerCleanup / pipeline throw）すべてに `JobStateStore.fail()` ガードを追加。既存の `fail()` API を再利用しており新しい抽象は不要。pipeline catch の defensive guard（ディスク状態を読み取り `"running"` のときだけ遷移）は安全性が高い。主な課題はテストカバレッジ — test-cases.md の must シナリオのうち buildDeps / registerCleanup 失敗パスが未テスト。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 5 | 0.10 | 0.50 |
| **Total** | | | **7.80** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/core/command/runner.test.ts | test-cases.md の must シナリオ TC-CR-010（buildDeps fail → INIT_FAILED）と TC-CR-010b（registerCleanup fail → INIT_FAILED）のテストが未実装。Task 2 の try-catch が直接テストされていない | `buildMockRuntime` に `buildDepsThrow` オプションを追加し、buildDeps throw 時に disk state が `failed` + `error.code === "INIT_FAILED"` になることを検証するテストを追加する。registerCleanup は同じ catch ブロックなので 1 テストで十分 |
| 2 | MEDIUM | testing | tests/unit/core/command/runner.test.ts | テスト番号が test-cases.md と不一致。test file の TC-CR-010 は pipeline throw（test-cases.md では TC-CR-011）、test file の TC-CR-011 は safety net 保持（test-cases.md では TC-CR-012）。相互参照時に混乱する | test file 側の番号を test-cases.md に合わせてリナンバーする（TC-CR-010 → TC-CR-011、TC-CR-011 → TC-CR-012）。または test-cases.md 側を合わせる |
| 3 | LOW | testing | tests/unit/core/command/runner.test.ts | test-cases.md の must シナリオ TC-CR-013（preflight fail → state 未作成）と TC-CR-014（request.md 不在 → state 未作成）が未テスト。ただし pre-existing behavior で今回変更されたコードではない | 次の変更で追加を検討。現時点では既存動作のリグレッション防止テストとして優先度は低い |
| 4 | LOW | maintainability | src/core/command/runner.ts:154 | `diskState as JobState` キャスト — `store.load()` は `NormalizedJobState`（steps が non-optional）を返す。`fail()` は `JobState` を受ける。型的には安全だが暗黙的 | `fail()` の引数型を `NormalizedJobState` も受け付けるようにするか、明示的なコメントを追加する |

## Verdict

- **verdict**: approved
- **Total Score**: 7.80 (threshold: 7.0)
- **CRITICAL**: 0
- **HIGH**: 0
- **MEDIUM**: 2
- **LOW**: 2

実装品質は高く、correctness / architecture ともに良好。MEDIUM 指摘はテストカバレッジの改善提案であり、実装コード自体に問題はない。
