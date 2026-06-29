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
| 1 | medium | correctness | src/core/prune/runner.ts | `worktreeManager.remove` が throw した後も `info.push("Removed: /path")` と `removed++` が実行され、最終メッセージ "Removed N orphan worktree(s)" が警告と矛盾する | remove 失敗時は `info` への "Removed:" プッシュをスキップし、カウントしない。"Skipped (remove failed): /path" に変更するか、試行カウントと成功カウントを分離する | yes |
| 2 | low | testing | tests/unit/core/prune/runner.test.ts | `"continues with warning when worktreeManager.prune fails"` テストが `mockScan.mockResolvedValue([])` で orphan 0 件にしているため prune が実際には呼ばれない（コメント自体が "early return before prune is called" と述べている） | `mockScan.mockResolvedValue([makeOrphan()])` に変更し、`mockInspect` も設定して prune failure を実際に発火させる | yes |
| 3 | low | testing | specrunner/changes/orphan-worktree-doctor/test-cases.md | TC-013 が「git worktree list を呼ばずに [] を返す」と規定しているが、実装は常に git を呼びフィルタリングする（動作は正しい）。design.md D2 は実装と整合しており、TC-013 の「without invoking git worktree list」制約が過剰仕様 | TC-013 の THEN を「returns [] without throwing」に修正し、git 呼出有無への言及を除く | no |
| 4 | low | testing | tests/unit/core/doctor/orphan-worktrees-check.test.ts | TC-001/TC-007 は `integration` 分類だが実装はモックベースのユニットテスト。T-02 AC が要求した「real temp git repo の fixture テスト」が未実装 | 将来的に `tmp-git-repo` を使った統合テストを追加する（今回の must AC はモックで充足済み） | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 10 | 0.25 |
| architecture | 9 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 9 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 8.85

## Summary

全 `must` 受け入れ基準を充足しており、ビルド・typecheck・テスト（419 files / 5685 tests）すべて green。

**設計の評価**: `scanOrphanWorktrees` への依存注入（`spawn`, `listStates`）により doctor check と prune runner が同一検出ロジックを共有しつつ独立してテスト可能。要件「検出ロジックを check と prune で共有する（二重実装しない）」を完全に満たしている。`inspectWorktreeWork` の fail-safe（git エラー時に `hasWork: true` を返し削除しない）は work-protection guard として堅牢。`"prune"` を `job.guardedSubcommands` に追加済みで worktree 内からの実行を拒否する。`orphan-sidecars` を含む既存 check への変更はゼロ。

**ブロッキング所見なし**。F-01（`removed` カウンタの誤カウント）は出力精度の問題で安全性には影響しない。F-02/F-03/F-04 はテスト品質・仕様記述の課題。
