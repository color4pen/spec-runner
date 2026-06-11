# Code Review Feedback — iteration 001

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | testing | `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` | TC-011 (should): thrown error `.message` and `.code` from `maybeThrowTransientResult` are not directly asserted. Both are exercised indirectly — `.code` via the resume-fallback guard, `.message` via the `isTransientAgentError` round-trip in AC-ER1/AC-ER2. | Add a unit test that calls `runMainWorkTurn` directly and asserts the thrown error properties. | no |
| 2 | low | testing | `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` | Resume-fallback bypass when `ctx.session.resumeSessionId` is set and the first call returns a transient error result is not tested. The `isTransientResult` code guard (`agent-runner.ts:336`) is correct but the branch is dark. | Add a test with `session: { resumeSessionId: "prev" }` where call 1 returns a transient error result and verify the resume fallback is not invoked. | no |
| 3 | low | testing | `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` | AC-ER4 uses `errors: []` (empty array) rather than a truly missing `errors` field as described in the task spec. Behaviour is identical via the `?? []` fallback but the description is imprecise. | n/a — behaviour correct, test description could note the equivalence. | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.90

## Summary

両ギャップを最小変更で塞いだ実装。

- **Gap 1**: `"stream idle timeout"` をホワイトリストに追加 — fail-closed 原則維持、既存トークンと同一の命名規則に準拠。
- **Gap 2**: `maybeThrowTransientResult` により transient な error result を throw に変換 — 既存の `retryWithBackoff` / `step:retry` 発火経路をそのまま再利用し、新しいリトライ層を追加せずに済んでいる。
- 非 transient error result・空 errors 配列のいずれも即 halt する fail-closed セマンティクスは不変。
- must 優先度テストケース TC-001/002/003/004/006/009/010 はすべてカバー済み。should ケース TC-005/007/008 もカバー済み。TC-011 のみ直接アサーションなし（info レベル）。
- verification 全 4 フェーズ（build / typecheck / test 4165 cases / lint）pass。

