# Spec Review Result: finish-worktree-branch-delete-order

- **reviewer**: spec-reviewer
- **iteration**: 1
- **verdict**: approved

## Summary

request.md の 3 要件（`--delete-branch` 除去、Phase 4 branch 削除、delta spec 更新）が proposal → design → tasks → delta spec に一貫して展開されている。ソースコード参照（L394, L284-286, L429）も実ファイルと一致。best-effort エラーハンドリング方針が両モード（local runtime / managed）で統一されており、resume path との整合性も設計に含まれている。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | completeness | tasks.md | L205 の既存コメント `// Phase 3: gh pr merge --squash --delete-branch` の更新が T1-T5 のいずれにも含まれていない | T1 に「L205 コメントから `--delete-branch` を削除」を追加する |
| 2 | LOW | consistency | specs/cli-finish-command/spec.md (delta) | base spec の Phase 4 記述 (L85) `Phase 4: markJobArchived + git checkout main + git pull --ff-only` を delta で上書きしているが、base spec L86 の worktree-aware 注釈はそのまま残る。delta の Phase 4 記述に worktree-aware 動作（checkout/pull skip 条件）も含めると完全 | delta の Phase 4 に「worktree-aware: linked worktree の場合 checkout/pull をスキップ」注釈を追加する |

## Completeness

| 要件 (request.md) | 対応アーティファクト | 充足 |
|-------------------|---------------------|------|
| Phase 3 から `--delete-branch` を外す | proposal §1, design §1, tasks T1, delta spec Phase 3 | ✅ |
| Phase 4 で feature branch を削除 | proposal §2, design §2-3, tasks T2, delta spec Phase 4 + Scenario | ✅ |
| delta spec 追加 | specs/cli-finish-command/spec.md | ✅ |
| dry-run 出力の `merge-strategy` 更新 | design §4, tasks T3, delta spec dry-run section | ✅ |

## Consistency

- delta spec の Phase 記述と design.md の実行順テーブルが一致
- `ResolvedTarget.branch` が `types.ts:14` に存在し、tasks T2 で `target.branch` を参照可能
- best-effort 方針が design / tasks / delta spec の 3 箇所で統一的に記述されている
- MERGED resume path での branch 不在ケースが design §5 で考慮済み

## Feasibility

- branch 削除の `cwd` は main worktree（`cwd` 変数）を使用。local runtime path では worktree 除去後なので feature branch は free
- managed mode linked worktree では `git branch -D` が失敗する可能性があるが、best-effort で許容（design のリスク分析に合致）
