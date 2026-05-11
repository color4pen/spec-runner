# Review Feedback: finish-conflict-precheck (Iteration 1)

- **reviewer**: code-review
- **iteration**: 1
- **date**: 2026-05-11
- **verdict**: approved

## Summary

実装は設計通り。`checkMergeableForMerge` は既存の `fetchPrViewWithRetry` / `pollMergeStateAfterPush` と同じパターンに揃えられており、orchestrator への統合も `mergeFeaturePrPhase3` 先頭の guard として最小限の変更で収まっている。typecheck green、全 1634 テスト pass。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 9 | 0.25 | 2.25 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.40** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/finish-orchestrator.test.ts | TC-CONFLICT-005 (must): `gh pr view --json mergeable` が非ゼロ exit code を返す場合の専用テストが未実装。pr-status.ts L148-158 のコードパスはカバーされていない | spawn mock で mergeable クエリのみ exitCode:1 を返すテストを追加し、escalation が返ることと `gh pr merge` が呼ばれないことを assert する |
| 2 | MEDIUM | testing | tests/finish-orchestrator.test.ts | TC-CONFLICT-006 (must): TC-CONFLICT-001 が `escalation.includes("rebase")` のみ assert しており、baseBranch ("main") が rebase コマンド例に含まれることの明示的検証がない | `expect(result.escalation).toContain("git rebase main")` を TC-CONFLICT-001 に追加する |
| 3 | LOW | testing | tests/finish-orchestrator.test.ts | TC-CONFLICT-008 (should): UNKNOWN×2 → MERGEABLE（境界値: リトライ上限ギリギリで成功）のテストが未実装 | 3回目の mergeable チェックで MERGEABLE を返す spawn mock を使ったテストを追加する |

## Scenario Coverage (test-cases.md)

| ID | Priority | Status | Notes |
|----|----------|--------|-------|
| TC-CONFLICT-001 | must | covered | 専用テスト実装済み |
| TC-CONFLICT-002 | must | covered | TC-123 等 happy path で暗黙カバー |
| TC-CONFLICT-003 | must | covered | 専用テスト実装済み |
| TC-CONFLICT-004 | must | covered | 専用テスト実装済み |
| TC-CONFLICT-005 | must | **missing** | Finding #1 |
| TC-CONFLICT-006 | must | **partial** | Finding #2 |
| TC-CONFLICT-007 | must | covered | 既存テスト全 pass で暗黙検証 |
| TC-CONFLICT-008 | should | missing | Finding #3 |
| TC-CONFLICT-009 | should | covered | 定数は export されており構造的に検証可能 |
| TC-CONFLICT-010 | should | covered | コード構造で検証済み |
| TC-CONFLICT-011 | should | covered | TC-CONFLICT-001 が Phase 2 CLEAN 通過後に Phase 3 CONFLICTING を検出 |
| TC-CONFLICT-012 | could | not tested | sleepFn DI の単体テストは未実装（TC-CONFLICT-003 で間接カバー） |

## Verification

- `bun run typecheck`: pass
- `bun run test`: 143 files, 1634 tests, all passed
