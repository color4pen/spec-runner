# Code Review Feedback — iteration 001

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): `- **iteration**: NNN` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): `- **total**: <decimal>`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | medium | testing | `src/core/archive/orchestrator.ts` / `tests/unit/no-worktree-archive.test.ts` | no-worktree mode で `git checkout <featureBranch>` 前の uncommitted changes ガードが未実装。design.md D1 は `git status --porcelain` で変更を検出して escalation することを明示。テスト TC-030（test-cases.md: should）も未作成。未トラッキング変更や非競合変更があると archive commit に意図しない差分が混入する可能性がある。 | `recordArchiveOnBranch` の no-worktree 分岐入口（`git checkout <featureBranch>` の直前）で `git status --porcelain` を実行し、出力が非空なら escalation を返すガードを追加する。`tests/unit/no-worktree-archive.test.ts` に uncommitted changes があるとき exit 1 を返し checkout が呼ばれないことを確認するテストを追加する。 | yes |
| 2 | low | testing | `tests/unit/core/archive/merge-then-archive.test.ts` | ヘッダーコメント（line 24）に `TC-MTA-STATUS-PRE-MERGE` が列挙されているが対応 `describe` ブロックが存在しない。不変（`archived` = merge 後のみ）は `TC-MTA-CLEANUP-MERGE` が間接的にカバーしており動作への影響はなし。 | ヘッダーコメントから削除するか、明示的なテストを追加してドキュメントと実装を一致させる。 | yes |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.05

## Summary

must-level AC 全 7 件が実装・テスト済み。`typecheck && test` は 5677 件全パス（verification-result.md 確認）。

**AC カバレッジ（must）**

| AC | Evidence |
|----|----------|
| no-merge archive が base への git checkout/commit/push を行わない | TC-003, TC-006, TC-NW-012 — spawn mock で push to base が呼ばれないことを assert |
| archive 記帳コミットが feature branch に乗り remote push される | TC-003, TC-AO-ORDER, TC-NW-012 |
| protected base 環境で no-merge archive が成功する | no-merge path は base に触れない構造のため inherently satisfied |
| --with-merge が CI green 後に merge し merge 後にのみ cleanup | TC-MTA-ORDER（呼び出し順 assert）、TC-MTA-CLEANUP-MERGE（失敗時 cleanup 抑止） |
| merge 完了前に archived にならない | `archived` は `cleanupAfterMerge` 経由のみ（merge 成功後限定）の制御フローで構造保証 |
| 記帳済みでの再実行が no-op | TC-AO-IDEMPOTENT-AR、TC-014（archive-recorded 状態での冪等再実行） |
| typecheck && test green | verification-result.md: 5677 tests passed |

**設計不変の確認**

- **client-closed 維持**: `src/core/archive/orchestrator.ts` に `github-client` import なし（TC-028 / T-04 AC 充足）。
- **status lifecycle の網羅**: `archive-recorded` 追加が schema.ts / lifecycle.ts / reconcile.ts / cancel / doctor / ps / command-registry すべての消費箇所に反映（D4 網羅列挙）。lifecycle テストは `ALL_STATUSES` に `archive-recorded` を含む全 56 遷移組み合わせを検証。
- **`archived` への到達経路限定**: `cleanupAfterMerge` だけが `markJobArchived` を呼び、`cleanupAfterMerge` は merge 成功後にのみ呼ばれる。`reconcilePrState` の `archive-recorded + MERGED → archived` 遷移もテスト済み（TC-PR-AR）。
- **冪等性**: `markJobArchiveRecorded`（TC-AR-002）、`archiveChangeFolder` skip、`commitArchive` skip がそれぞれ独立テスト済み。

