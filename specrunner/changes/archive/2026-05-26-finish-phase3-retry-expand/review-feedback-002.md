# Review Feedback: finish-phase3-retry-expand (Iteration 2)

- **reviewer**: code-review
- **iteration**: 2
- **date**: 2026-05-26
- **verdict**: approved

## Summary

Iteration 1 の MEDIUM finding（TC-002: 小文字 'r' バリアントのテスト未実装）が `TC-PM-016b` 追加で解消。must シナリオ 13/13 カバー達成。typecheck / lint / 2995 tests green を確認。

Iteration 1 の 2 件の LOW finding は未修正だが、いずれも correctness に影響なく merge を妨げない。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **8.80** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | documentation | src/adapter/github/github-client.ts | `mergePullRequest()` の JSDoc (L363–365) が旧パターンのまま: `"Base branch was modified" / "unstable state", 423 Locked` のみ列挙。今回追加した 3 パターン (`"not mergeable"`, `"head branch was modified"`, `"required status check"`) が未記載。`isMergeTransientFailure()` の JSDoc は正しく更新済みのため二重管理状態 | `mergePullRequest` JSDoc の "Transient failures" 行を `isMergeTransientFailure` JSDoc のリストに合わせて更新 |
| 2 | LOW | testing | tests/unit/adapter/github/github-client-pr.test.ts | TC-PM-002 (L212) が `message: "Pull Request is not mergeable"` を使用したまま。これは現在 transient 扱いで 4 回 retry されるが、test は call count を assert していないため no-retry 動作の検証になっていない。テスト名に `(merge not allowed / not mergeable)` と残っておりミスリーディング | message を `"Merge not allowed"` に変更して永続エラーの 1 回のみ呼び出しを明示。または `expect(mockFetch).toHaveBeenCalledTimes(4)` を追加 |

## Iter 1 Findings 対応状況

| # | Severity | 対応状況 |
|---|----------|---------|
| 1 (TC-002 must missing) | MEDIUM | ✅ 解消 — TC-PM-016b 追加 (L360–371) |
| 2 (mergePullRequest JSDoc) | LOW | ❌ 未修正 → Finding #1 (本 iter) |
| 3 (TC-PM-002 misleading) | LOW | ❌ 未修正 → Finding #2 (本 iter) |

## Scenario Coverage (test-cases.md)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-001 | must | covered | TC-PM-016 |
| TC-002 | must | covered | TC-PM-016b (iter 2 追加) |
| TC-003 | must | covered | TC-PM-017 |
| TC-004 | must | covered | TC-PM-018 |
| TC-005 | must | covered | TC-PM-019 |
| TC-101 | must | covered | TC-PM-014 |
| TC-102 | must | covered | TC-PM-015 |
| TC-201 | must | covered | TC-PM-010 |
| TC-202 | must | covered | TC-PM-011 |
| TC-203 | must | covered | TC-PM-012 |
| TC-204 | must | covered | TC-PM-013 |
| TC-401 | must | covered | typecheck pass |
| TC-402 | must | covered | 2995 tests pass |
| TC-006 | should | not tested | Head branch × 4 exhaustion |
| TC-007 | should | not tested | Required status check × 4 exhaustion |
| TC-103 | should | not tested | 405 "Merge not allowed" → no retry の明示テストなし |
| TC-301 | should | not tested | 大文字 "NOT MERGEABLE" → retry |
| TC-302 | should | not tested | merged:true + "not mergeable" message → no retry |
| TC-303 | should | not tested | パターン干渉なしの明示テスト |

## Verification

- `bun run typecheck`: pass
- `bun run test`: 267 files, 2995 tests, all passed
- `bun run lint`: pass
- must TCs: 13/13 covered
