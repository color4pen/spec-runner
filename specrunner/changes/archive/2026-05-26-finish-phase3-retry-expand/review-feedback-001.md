# Review Feedback: finish-phase3-retry-expand (Iteration 1)

- **reviewer**: code-review
- **iteration**: 1
- **date**: 2026-05-26
- **verdict**: needs-fix

## Summary

実装は設計通り。`isMergeTransientFailure()` に 3 パターン追加、TC-PM-016 書き換え、TC-PM-017〜019 新規追加。typecheck / lint / 全 2995 テスト green。設計判断 (D1〜D6) はすべて実装に反映されている。

ただし test-cases.md の **must** シナリオ TC-002（小文字 'r' バリアント）が test file に存在しない。実装の `.toLowerCase()` が正しいため動作バグはないが、test-cases.md に対するカバレッジが 12/13 となる。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.70** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/unit/adapter/github/github-client-pr.test.ts | TC-002 (must): 405 `"Pull request is not mergeable"` (小文字 r) → retry → 成功 のテストが未実装。TC-PM-016 は大文字 R の `"Pull Request is not mergeable"` のみカバー。design.md D2 に「小文字 r の表記もあり得る」と明記されており、`.toLowerCase()` の動作確認が must に指定されている | TC-PM-016 の隣に `TC-PM-016b` を追加: `mockResolvedValueOnce(mergeResponse(405, { message: "Pull request is not mergeable" }))` → `mockResolvedValueOnce(200 merged)` → `merged: true`, `mockFetch` 2 回 |
| 2 | LOW | documentation | src/adapter/github/github-client.ts | `mergePullRequest()` の JSDoc (L362–366) が古いまま: `"Base branch was modified" / "unstable state", 423 Locked` のみ列挙されており、今回追加した 3 パターンが記載されていない。`isMergeTransientFailure()` の JSDoc は正しく更新済み | `mergePullRequest` JSDoc の "Transient failures" 行を `isMergeTransientFailure` JSDoc と同期させる |
| 3 | LOW | testing | tests/unit/adapter/github/github-client-pr.test.ts | TC-PM-002 は message に `"Pull Request is not mergeable"` を使いつつ `mockResolvedValue`（全試行共通）で call count を assert していない。変更後は 4 回呼ばれるが test がそれを検証していないため、挙動が変わっても黙過される。コメントにも `(merge not allowed / not mergeable)` と残っており misleading | TC-PM-002 の message を `"Merge not allowed"` に変更し永続エラーの no-retry を明示する（または call count を 4 に assert する） |

## Scenario Coverage (test-cases.md)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-001 | must | covered | TC-PM-016 (大文字 R) |
| TC-002 | must | **missing** | Finding #1 |
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
| TC-006 | should | not tested | exhaustion シナリオ (Head branch × 4) |
| TC-007 | should | not tested | exhaustion シナリオ (Required status check × 4) |
| TC-103 | should | not tested | 405 "Merge not allowed" → no retry の明示テストなし（TC-PM-002 が実質カバーしなくなった） |
| TC-301 | should | not tested | 大文字 "NOT MERGEABLE" → retry |
| TC-302 | should | not tested | merged:true + "not mergeable" message → no retry |
| TC-303 | should | not tested | パターン干渉なしの明示テスト |

## Verification

- `bun run typecheck`: pass
- `bun run test`: 267 files, 2995 tests, all passed
- `bun run lint`: pass
