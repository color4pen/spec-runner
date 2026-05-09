# Code Review — worktree-guard — Iteration 1

## Summary

実装は仕様通り、クリーンで堅牢。検出ロジック（`.git` file vs directory）は git の仕様に準拠しており、エントリポイントでの一元ガードは DRY で拡張しやすい。エラーハンドリングは既存の `SpecRunnerError` パターンに正しく乗っている。テストは核心ロジックを十分にカバーしているが、test-cases.md の must シナリオに対して軽微なギャップがある。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|---------|
| correctness | 9 | 0.30 | 2.70 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 9 | 0.10 | 0.90 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.80** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | testing | tests/unit/cli/specrunner-worktree-guard.test.ts | TC-12（doctor from worktree）が must だがテスト未実装。ps のみテスト済み。コードは正しい（doctor は WORKTREE_GUARDED_COMMANDS に含まれない）がテスト仕様との不一致 | TC-WG-004 と同様のテストを doctor 用に追加する |
| 2 | LOW | testing | tests/unit/cli/specrunner-worktree-guard.test.ts | TC-13/TC-14（main worktree から run/finish）が must だが worktree-guard テストに明示テストなし。既存 dispatch テストで `detectWorktree` を `isWorktree: false` でモックしており暗黙的にはカバー | worktree-guard テストに main worktree シナリオ（`setWorktreeDetection(false)` → run が guard エラーなしで通過）を追加する |

## Scenario Coverage (test-cases.md)

| TC | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-01 | must | ✅ | detection.test.ts |
| TC-02 | must | ✅ | detection.test.ts |
| TC-03 | must | ✅ | detection.test.ts（TC-02 と同一テストで検証） |
| TC-04 | must | ✅ | detection.test.ts |
| TC-05 | should | ✅ | detection.ts L49 で `.trim()` 実装済み。テストは暗黙的 |
| TC-06 | must | ✅ | errors.ts に WORKTREE_GUARD 定義。統合テストで使用 |
| TC-07 | must | ✅ | worktree-guard.test.ts TC-WG-005 で hint 検証 |
| TC-08 | must | ✅ | worktree-guard.test.ts TC-WG-001 |
| TC-09 | must | ✅ | worktree-guard.test.ts TC-WG-002 |
| TC-10 | must | ✅ | worktree-guard.test.ts TC-WG-003 |
| TC-11 | must | ✅ | worktree-guard.test.ts TC-WG-004 |
| TC-12 | must | ⚠️ | doctor 用テスト未実装（Finding #1） |
| TC-13 | must | ⚠️ | 暗黙カバーのみ（Finding #2） |
| TC-14 | must | ⚠️ | 暗黙カバーのみ（Finding #2） |
| TC-15 | must | ✅ | worktree-guard.test.ts TC-WG-005 |
| TC-16 | should | ✅ | detection.ts ENOENT → isWorktree: false → guard スキップ |
| TC-17 | must | ✅ | typecheck green 確認済み |
| TC-18 | must | ✅ | 136 files, 1330 tests passed |

## Verification

- `bun run typecheck`: ✅ green
- `bun run test`: ✅ 136 passed / 1330 tests

- **verdict**: approved
