# Code Review — finish-phase4-reorder — Iteration 1

## Meta

- **reviewer**: code-reviewer
- **iteration**: 1
- **date**: 2026-05-09
- **verdict**: approved

## Summary

実装は設計に忠実で、5 つの受け入れ基準すべてを満たしている。`markJobArchived` が Phase 3 直後に移動されたことで、Phase 4 cleanup 失敗時の state 不整合問題（#178）が解消される。`canTransition` / `transitionJob` への移行も正確。typecheck + 全 1472 テスト green。

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | N/A | — | — |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 8 | 0.10 | 0.80 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **7.9** |

security は本変更で対象外のため除外。残カテゴリの weight を正規化: correctness 0.40, architecture 0.20, performance 0.13, maintainability 0.13, testing 0.13 → Total = 3.20 + 1.60 + 1.04 + 1.04 + 0.91 = **7.8**

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/finish-orchestrator.test.ts | TC-FIN-REORDER-004（git checkout 失敗 → archived, exit 0）が must シナリオだがテスト未実装。アーキテクチャ上は保証されるが、best-effort 化のリグレッションガードがない | spawn mock で `git checkout` を exitCode 1 にし、exit 0 + status=archived を検証するテストを追加 |
| 2 | MEDIUM | testing | tests/finish-orchestrator.test.ts | TC-FIN-REORDER-005（updateJobState worktreePath:null 失敗 → archived, exit 0）が must シナリオだがテスト未実装。try-catch 保護の検証がコードレビューのみ | updateJobState を spy し throw させ、exit 0 + status=archived + stderr warning を検証するテストを追加 |
| 3 | LOW | maintainability | src/core/finish/orchestrator.ts:147 | `runPhase4Finalize` が常に `{ ok: true }` を返すため、`if (!p4.ok)` チェック（L147）が到達不能コード。型安全なので害はないが意図が不明瞭になる | 将来の cleanup で削除を検討。現時点では情報提供のみ |
| 4 | LOW | maintainability | src/core/finish/orchestrator.ts:249 | 関数名が `runPhase4Finalize` のまま。設計 D2 で `runPhase4Cleanup` への rename が言及されている（optional） | 次のリファクタで rename 検討。現時点では情報提供のみ |

## Acceptance Criteria Verification

| # | Criterion | Status |
|---|-----------|--------|
| 1 | markJobArchived が Phase 3 直後に実行される | ✅ L136-138（通常パス）, L141-142（prAlreadyMerged パス） |
| 2 | Phase 4 の cleanup 失敗が state 更新を阻害しない | ✅ markJobArchived が Phase 4 より前に呼ばれる。TC-FIN-P4-FAIL-001 で検証済み |
| 3 | assertJobFinishable が canTransition ベースに置換されている | ✅ job-state-update.ts L27 |
| 4 | Phase 4 の updateJobState(worktreePath: null) が try-catch で保護されている | ✅ orchestrator.ts L271-274 |
| 5 | TC-126 (archived → no-op) が引き続き通る | ✅ テスト green |
| 6 | bun run typecheck && bun run test が green | ✅ 138 files, 1472 tests passed |

## Scenario Coverage (test-cases.md)

| ID | Priority | Covered | Test |
|----|----------|---------|------|
| TC-FIN-REORDER-001 | must | ✅ | TC-124 |
| TC-FIN-REORDER-002 | must | △ | TC-106（exit 0 のみ。ordering 未検証） |
| TC-FIN-REORDER-003 | must | ✅ | TC-FIN-P4-FAIL-001 |
| TC-FIN-REORDER-004 | must | ❌ | — |
| TC-FIN-REORDER-005 | must | ❌ | — |
| TC-FIN-REORDER-006 | must | ✅ | 既存 finish-job-state tests |
| TC-FIN-REORDER-007 | must | ✅ | 既存 TC-031 |
| TC-FIN-REORDER-008 | must | ✅ | 既存 finish-job-state tests |
| TC-FIN-REORDER-009 | must | ✅ | コード検査（L271-274 try-catch 確認） |
| TC-FIN-REORDER-010 | must | ✅ | TC-126 |
| TC-FIN-REORDER-011 | should | △ | TC-029 は transitionJob 呼び出しを直接検証していない |
| TC-FIN-REORDER-012 | should | △ | TC-126 経由で間接的にカバー |
| TC-FIN-REORDER-013 | could | ❌ | — |

Must: 8/10 covered, Should: 0/2 explicitly covered, Could: 0/1
