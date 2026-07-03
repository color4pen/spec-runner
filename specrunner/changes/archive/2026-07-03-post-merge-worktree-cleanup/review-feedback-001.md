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
| 1 | low | testing | tests/unit/core/archive/merge-then-archive.test.ts | TC-001/TC-002（sidecar / 規約パスフォールバック）が TC-MTA-WORKTREE-FALLBACK では `resolveWorktreePathForArchive` をフルモックしているため、内部フォールバック段は実行されない。既存の orchestrator.test.ts が担保しており問題はないが、test-cases.md の TC-001/TC-002 との対応が明示的でない | 対応不要。既存テストとの組み合わせで受け入れ基準を満たしている | no |
| 2 | low | testing | tests/ | TC-005（should）— sidecar 削除より前に解決が完了する順序制約の明示テストがない。実装の構造（Step 1 で解決、Step 6 で cleanup）が制約を保証しているため機能上の問題はない | 対応不要 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 10 | 0.30 |
| security | 10 | 0.25 |
| architecture | 10 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 9.8

## Summary

変更は最小限（ソース 2 ファイル計 9 行、テスト 2 ファイル新規 + 既存 1 更新 1 行）で根本原因に直接対処している。

- `merge-then-archive.ts` の `state.worktreePath ?? null` を `await resolveWorktreePathForArchive(state, cwd)` に置き換えることで、記録経路（orchestrator）と掃除経路（merge-then-archive）のフォールバック対称性が回復した
- `post-merge-cleanup.ts` に `else if (!noWorktree && !worktreePath)` ブランチを追加し、解決失敗時の警告を実装した。条件が明確で意図が読みやすい
- `__tests__/merge-then-archive.test.ts` のモックに `resolveWorktreePathForArchive` を追加し、import 追加による `undefined` 呼び出しリスクを排除した

テスト: 426 files / 5745 tests all passed。typecheck / lint / build clean。
受け入れ基準 4 項目すべて満たす。findings はいずれも info（対応不要）。

