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
**Verdict blocking rules (derived by CLI from report_result findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と `report_result` findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | low | maintainability | specrunner/changes/job-list-archive-skip/design.md | D2 の opt-in 不要表に `resolve-target.ts` と `resolve-job.ts` が掲載されているが、実装は両者に `{ includeArchived: true }` を渡す。tasks.md が「required for existing multi-slug tests」と説明しており、finish/resume で archived job を slug 解決する実用的根拠がある。design.md が実態を反映していない。 | design.md D2 の表で両ファイルを opt-in 側に移動する。コード変更不要。 | no |
| 2 | low | testing | src/core/inbox/run-inbox.ts | test-cases.md TC-006（must/automated）「inbox tick with large archive does not load archived states」に対応するテストが追加されていない。実装は正しく（line 86, 331 ともに `list(repoRoot)` のみ）、TC-ARC-01 がストア層で保証しているが、inbox 経路の回帰テストがない。 | inbox の `list` 呼び出しに対して `includeArchived` が渡されないことをアサートするテストを追加する（任意）。 | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 9 | 0.30 |
| security | 9 | 0.25 |
| architecture | 8 | 0.15 |
| performance | 10 | 0.10 |
| maintainability | 8 | 0.10 |
| testing | 8 | 0.10 |

- **total**: 8.75

## Summary

実装は正確。`JobStateStore.list` に `opts?: { includeArchived?: boolean }` を追加し、デフォルトで archive ディレクトリ走査をスキップする設計は clean かつ後方互換。ストアレベルのテスト（TC-ARC-01/02）が `fs.readdir` spy で動作を固定している。`typecheck && test` ともに green。

指摘は 2 件ともに `low` で、コード修正不要（docs 整合は次回対応で可）。

